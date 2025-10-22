import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";

import { DataSource, entities, SaveQueryResult } from "@repo/indexer-database";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { O_ADAPTER_UPGRADEABLE_ABI } from "../adapter/oft/abis";
import { OFTReceivedEvent, OFTSentEvent } from "../adapter/oft/model";
import { OftRepository } from "../../database/OftRepository";
import {
  getOftChainConfiguration,
  isEndpointIdSupported,
} from "../adapter/oft/service";

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
  private oftTransferAggregator: OftTransferAggregator;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private oftRepository: OftRepository,
    private postgres: DataSource,
  ) {
    this.isInitialized = false;
    this.oftTransferAggregator = new OftTransferAggregator(postgres);
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
    await this.oftRepository.deleteUnfinalisedOFTEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    const timeToDeleteEvents = performance.now();
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
}
