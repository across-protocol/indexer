import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";

import {
  DataSource,
  entities,
  InsertResult,
  SaveQueryResult,
  UpdateResult,
} from "@repo/indexer-database";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { O_ADAPTER_UPGRADEABLE_ABI } from "../adapter/oft/abis";
import { OFTReceivedEvent, OFTSentEvent } from "../adapter/oft/model";
import { OftRepository } from "../../database/OftRepository";
import { getDbLockKeyForOftEvent } from "../../utils/spokePoolUtils";
import {
  getChainIdForEndpointId,
  getCorrespondingTokenAddress,
  getOftChainConfiguration,
  isEndpointIdSupported,
} from "../adapter/oft/service";
import { RelayStatus } from "../../../../indexer-database/dist/src/entities";

export type FetchEventsResult = {
  oftSentEvents: OFTSentEvent[];
  oftReceivedEvents: OFTReceivedEvent[];
  blocks: Record<string, providers.Block>;
};
export type StoreEventsResult = {
  oftSentEvents: SaveQueryResult<entities.OFTSent>[];
  oftReceivedEvents: SaveQueryResult<entities.OFTReceived>[];
};

const SWAP_API_CALLDATA_MARKER = "73c0de";

export class OFTIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private oftRepository: OftRepository,
    private postgres: DataSource,
  ) {
    this.isInitialized = false;
  }

  private initialize() {}

  public getDataIdentifier() {
    return `oft:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getOftChainConfiguration(this.chainId).tokens[0]!.startBlockNumber;
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#OFTIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    const startPerfTime = performance.now();
    const events = await this.fetchEventsByRange(blockRange);
    const timeToFetchEvents = performance.now();
    const storedEvents = await this.storeEvents(
      events,
      lastFinalisedBlock,
      getOftChainConfiguration(this.chainId).tokens[0]!.address,
    );
    const timeToStoreEvents = performance.now();
    const deletedEvents = await this.oftRepository.deleteUnfinalisedOFTEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    const timeToDeleteEvents = performance.now();

    const processedEvents = await this.processDatabaseEvents(
      deletedEvents.oftSentEvents,
      deletedEvents.oftReceivedEvents,
      storedEvents.oftSentEvents.map((event) => event.data),
      storedEvents.oftReceivedEvents.map((event) => event.data),
    );
    const timeToProcessEvents = performance.now();
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#OFTIndexerDataHandler#processBlockRange",
      message: "System Time Log for OFTIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - timeToFetchEvents,
      timeToDeleteEvents: timeToDeleteEvents - timeToStoreEvents,
      timeToFetchEvents: timeToFetchEvents - startPerfTime,
      timeToProcessEvents: timeToProcessEvents - timeToDeleteEvents,
    });
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const oftAdapterContract = new ethers.Contract(
      getOftChainConfiguration(this.chainId).tokens[0]!.address,
      O_ADAPTER_UPGRADEABLE_ABI,
      this.provider,
    );
    const [oftSentEvents, oftReceivedEvents] = await Promise.all([
      oftAdapterContract.queryFilter(
        "OFTSent",
        blockRange.from,
        blockRange.to,
      ) as Promise<OFTSentEvent[]>,
      oftAdapterContract.queryFilter(
        "OFTReceived",
        blockRange.from,
        blockRange.to,
      ) as Promise<OFTReceivedEvent[]>,
    ]);
    const transactions = await this.getTransactions([
      ...new Set(oftSentEvents.map((event) => event.transactionHash)),
    ]);
    const filteredOftSentEvents = await this.filterTransactionsFromSwapApi(
      transactions,
      oftSentEvents,
    );
    const filteredOftReceivedEvents =
      await this.filterTransactionsForSupportedEndpointIds(oftReceivedEvents);
    const blocks = await this.getBlocks([
      ...new Set([
        ...filteredOftSentEvents.map((event) => event.blockHash),
        ...filteredOftReceivedEvents.map((event) => event.blockHash),
      ]),
    ]);
    if (oftSentEvents.length > 0) {
      this.logger.debug({
        at: "Indexer#OFTIndexerDataHandler#fetchEventsByRange",
        message: `Found ${oftSentEvents.length} OFTSent events on chain ${this.chainId}`,
      });
    }
    if (oftReceivedEvents.length > 0) {
      this.logger.debug({
        at: "Indexer#OFTIndexerDataHandler#fetchEventsByRange",
        message: `Found ${oftReceivedEvents.length} OFTReceived events on chain ${this.chainId}`,
      });
    }
    return {
      oftSentEvents: filteredOftSentEvents,
      oftReceivedEvents: filteredOftReceivedEvents,
      blocks,
    };
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
    tokenAddress: string,
  ): Promise<StoreEventsResult> {
    const { blocks, oftReceivedEvents, oftSentEvents } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);
    const [savedOftSentEvents, savedOftReceivedEvents] = await Promise.all([
      this.oftRepository.formatAndSaveOftSentEvents(
        oftSentEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        tokenAddress,
      ),
      this.oftRepository.formatAndSaveOftReceivedEvents(
        oftReceivedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        tokenAddress,
      ),
    ]);

    return {
      oftSentEvents: savedOftSentEvents,
      oftReceivedEvents: savedOftReceivedEvents,
    };
  }

  private async getTransactions(uniqueTransactionHashes: string[]) {
    const transactions = await Promise.all(
      uniqueTransactionHashes.map(async (txHash) => {
        return this.provider.getTransaction(txHash);
      }),
    );
    const transactionReceiptsMap = transactions.reduce(
      (acc, transaction) => {
        acc[transaction.hash] = transaction;
        return acc;
      },
      {} as Record<string, Transaction>,
    );
    return transactionReceiptsMap;
  }

  private async filterTransactionsForSupportedEndpointIds(
    oftReceivedEvents: OFTReceivedEvent[],
  ) {
    return oftReceivedEvents.filter((event) => {
      return isEndpointIdSupported(event.args.srcEid);
    });
  }

  private async filterTransactionsFromSwapApi(
    transactions: Record<string, Transaction>,
    oftSentEvents: OFTSentEvent[],
  ) {
    const transactionHashes = Object.values(transactions)
      .filter((transaction) => {
        return transaction.data.includes(SWAP_API_CALLDATA_MARKER);
      })
      .map((transaction) => transaction.hash);

    return oftSentEvents.filter((event) => {
      return (
        transactionHashes.includes(event.transactionHash) &&
        isEndpointIdSupported(event.args.dstEid)
      );
    });
  }

  private async getBlocks(blockHashes: string[]) {
    const blocks = await Promise.all(
      blockHashes.map(async (blockHash) => {
        return this.provider.getBlock(blockHash);
      }),
    );
    return blocks.reduce(
      (acc, block) => {
        acc[block.hash] = block;
        return acc;
      },
      {} as Record<string, providers.Block>,
    );
  }

  private getBlocksTimestamps(
    blocks: Record<string, providers.Block>,
  ): Record<string, Date> {
    return Object.entries(blocks).reduce(
      (acc, [blockHash, block]) => {
        acc[blockHash] = new Date(block.timestamp * 1000);
        return acc;
      },
      {} as Record<string, Date>,
    );
  }

  private async processDatabaseEvents(
    deletedOftSentEvents: entities.OFTSent[],
    deletedOftReceivedEvents: entities.OFTReceived[],
    oftSentEvents: entities.OFTSent[],
    oftReceivedEvents: entities.OFTReceived[],
  ) {
    await this.processDeletedEvents(
      deletedOftSentEvents,
      deletedOftReceivedEvents,
    );
    await this.assignOftEventsToOftTransfer(oftSentEvents, oftReceivedEvents);
  }

  private async processDeletedEvents(
    deletedOftSentEvents: entities.OFTSent[],
    deletedOftReceivedEvents: entities.OFTReceived[],
  ) {
    await Promise.all([
      this.processDeletedOftSentEvents(deletedOftSentEvents),
      this.processDeletedOftReceivedEvents(deletedOftReceivedEvents),
    ]);
  }

  private async processDeletedOftSentEvents(
    deletedOftSentEvents: entities.OFTSent[],
  ) {
    for (const oftSentEvent of deletedOftSentEvents) {
      await this.postgres.transaction(async (tem) => {
        const oftTransferRepository = tem.getRepository(entities.OftTransfer);
        const lockKey = getDbLockKeyForOftEvent(oftSentEvent);
        await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
        const relatedOftTransfer = await oftTransferRepository.findOne({
          where: { oftSentEventId: oftSentEvent.id },
        });

        if (!relatedOftTransfer) return;

        if (!relatedOftTransfer.oftReceivedEventId) {
          // There is no related OFTReceivedEvent, so we can delete the OFTTransfer row
          await oftTransferRepository.delete({ id: relatedOftTransfer.id });
        } else {
          // There is a related OFTReceivedEvent, so we must update the OFTTransfer row
          await oftTransferRepository.update(
            { id: relatedOftTransfer.id },
            {
              oftSentEventId: null,
              originGasFee: null,
              originGasFeeUsd: null,
              originGasTokenPriceUsd: null,
              originTxnRef: null,
            },
          );
        }
      });
    }
  }

  private async processDeletedOftReceivedEvents(
    deletedOftReceivedEvents: entities.OFTReceived[],
  ) {
    for (const oftReceivedEvent of deletedOftReceivedEvents) {
      await this.postgres.transaction(async (tem) => {
        const oftTransferRepository = tem.getRepository(entities.OftTransfer);
        const lockKey = getDbLockKeyForOftEvent(oftReceivedEvent);
        await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
        const relatedOftTransfer = await oftTransferRepository.findOne({
          where: { oftReceivedEventId: oftReceivedEvent.id },
        });

        if (!relatedOftTransfer) return;

        if (!relatedOftTransfer.oftSentEventId) {
          // There is no related OFTSentEvent, so we can delete the OFTTransfer row
          await oftTransferRepository.delete({ id: relatedOftTransfer.id });
        } else {
          // There is a related OFTSentEvent, so we must update the OFTTransfer row
          await oftTransferRepository.update(
            { id: relatedOftTransfer.id },
            {
              oftReceivedEventId: null,
              destinationTxnRef: null,
              status: RelayStatus.Unfilled,
            },
          );
        }
      });
    }
  }

  private async assignOftEventsToOftTransfer(
    oftSentEvents: entities.OFTSent[],
    oftReceivedEvents: entities.OFTReceived[],
  ) {
    await Promise.all([
      this.assignOftSentEventsToOftTransfer(oftSentEvents),
      this.assignOftReceivedEventsToOftTransfer(oftReceivedEvents),
    ]);
  }

  private async assignOftSentEventsToOftTransfer(
    oftSentEvents: entities.OFTSent[],
  ) {
    const insertResults: InsertResult[] = [];
    const updateResults: UpdateResult[] = [];

    await Promise.all(
      oftSentEvents.map(async (oftSentEvent) => {
        // start a transaction
        await this.postgres.transaction(async (tem) => {
          const oftTransferRepository = tem.getRepository(entities.OftTransfer);
          const lockKey = getDbLockKeyForOftEvent(oftSentEvent);
          // Acquire a lock to prevent concurrent modifications on the same guid.
          // The lock is automatically released when the transaction commits or rolls back.
          await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
          const existingRow = await oftTransferRepository
            .createQueryBuilder()
            .where('"guid" = :guid', { guid: oftSentEvent.guid })
            .getOne();
          if (!existingRow) {
            const insertedRow = await oftTransferRepository.insert({
              ...this.formatOftSentEventToOftTransfer(oftSentEvent),
            });
            insertResults.push(insertedRow);
          } else if (
            existingRow &&
            existingRow.oftSentEventId !== oftSentEvent.id
          ) {
            const updatedRow = await oftTransferRepository.update(
              { id: existingRow.id },
              this.formatOftSentEventToOftTransfer(oftSentEvent),
            );
            updateResults.push(updatedRow);
          }
        });
      }),
    );
  }

  private async assignOftReceivedEventsToOftTransfer(
    oftReceivedEvents: entities.OFTReceived[],
  ) {
    await Promise.all(
      oftReceivedEvents.map(async (oftReceivedEvent) => {
        await this.postgres.transaction(async (tem) => {
          const oftTransferRepository = tem.getRepository(entities.OftTransfer);
          const lockKey = getDbLockKeyForOftEvent(oftReceivedEvent);
          await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
          const existingRow = await oftTransferRepository
            .createQueryBuilder()
            .where('"guid" = :guid', { guid: oftReceivedEvent.guid })
            .getOne();
          if (!existingRow) {
            await oftTransferRepository.insert({
              ...this.formatOftReceivedEventToOftTransfer(oftReceivedEvent),
            });
          } else if (
            existingRow &&
            existingRow.oftReceivedEventId !== oftReceivedEvent.id
          ) {
            await oftTransferRepository.update(
              { id: existingRow.id },
              this.formatOftReceivedEventToOftTransfer(oftReceivedEvent),
            );
          }
        });
      }),
    );
  }

  private formatOftSentEventToOftTransfer(
    oftSentEvent: entities.OFTSent,
  ): Partial<entities.OftTransfer> {
    const destinationChainId = getChainIdForEndpointId(oftSentEvent.dstEid);
    return {
      bridgeFeeUsd: "0",
      destinationChainId: destinationChainId.toString(),
      destinationTokenAddress: getCorrespondingTokenAddress(
        this.chainId,
        getOftChainConfiguration(this.chainId).tokens[0]!.address,
        destinationChainId,
      ),
      destinationTokenAmount: oftSentEvent.amountReceivedLD,
      guid: oftSentEvent.guid,
      oftSentEventId: oftSentEvent.id,
      originChainId: this.chainId.toString(),
      originGasFee: "0", // TODO
      originGasFeeUsd: "0", // TODO
      originGasTokenPriceUsd: "0", // TODO
      originTokenAddress: oftSentEvent.token,
      originTokenAmount: oftSentEvent.amountSentLD,
      originTxnRef: oftSentEvent.transactionHash,
    };
  }

  private formatOftReceivedEventToOftTransfer(
    oftReceivedEvent: entities.OFTReceived,
  ): Partial<entities.OftTransfer> {
    const originChainId = getChainIdForEndpointId(oftReceivedEvent.srcEid);
    return {
      bridgeFeeUsd: "0",
      destinationChainId: this.chainId.toString(),
      destinationTokenAddress: getOftChainConfiguration(this.chainId).tokens[0]!
        .address,
      destinationTokenAmount: oftReceivedEvent.amountReceivedLD,
      destinationTxnRef: oftReceivedEvent.transactionHash,
      guid: oftReceivedEvent.guid,
      oftReceivedEventId: oftReceivedEvent.id,
      originChainId: originChainId.toString(),
      originTokenAddress: getCorrespondingTokenAddress(
        this.chainId,
        oftReceivedEvent.token,
        originChainId,
      ),
      originTokenAmount: oftReceivedEvent.amountReceivedLD,
      status: RelayStatus.Filled,
    };
  }
}
