import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";

import { entities, SaveQueryResult } from "@repo/indexer-database";

import {
  ArbitraryActionsExecutedLog,
  BlockRange,
  FallbackHyperEVMFlowCompletedLog,
  SimpleTransferFlowCompletedLog,
} from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { O_ADAPTER_UPGRADEABLE_ABI } from "../adapter/oft/abis";
import {
  OFTReceivedEvent,
  OFTSentEvent,
  SponsoredOFTSendLog,
} from "../adapter/oft/model";
import { OftRepository } from "../../database/OftRepository";
import {
  getOftChainConfiguration,
  isEndpointIdSupported,
  SPONSORED_OFT_SRC_PERIPHERY_ADDRESS,
} from "../adapter/oft/service";
import { EventDecoder } from "../../web3/EventDecoder";
import { fetchEvents } from "../../utils/contractUtils";
import {
  formatAndSaveEvents,
  getEventsFromTransactionReceipts,
} from "./eventProcessing";
import {
  formatArbitraryActionsExecutedEvent,
  formatFallbackHyperEVMFlowCompletedEvent,
  formatSimpleTransferFlowCompletedEvent,
} from "./hyperEvmExecutor";
import { CHAIN_IDs } from "@across-protocol/constants";

export type FetchEventsResult = {
  oftSentEvents: OFTSentEvent[];
  oftReceivedEvents: OFTReceivedEvent[];
  sponsoredOFTSendEvents: SponsoredOFTSendLog[];
  simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[];
  fallbackHyperEVMFlowCompletedEvents: FallbackHyperEVMFlowCompletedLog[];
  arbitraryActionsExecutedEvents: ArbitraryActionsExecutedLog[];
  blocks: Record<string, providers.Block>;
};
export type StoreEventsResult = {
  oftSentEvents: SaveQueryResult<entities.OFTSent>[];
  oftReceivedEvents: SaveQueryResult<entities.OFTReceived>[];
  sponsoredOFTSendEvents: SaveQueryResult<entities.SponsoredOFTSend>[];
  simpleTransferFlowCompletedEvents: SaveQueryResult<entities.SimpleTransferFlowCompleted>[];
  fallbackHyperEVMFlowCompletedEvents: SaveQueryResult<entities.FallbackHyperEVMFlowCompleted>[];
  arbitraryActionsExecutedEvents: SaveQueryResult<entities.ArbitraryActionsExecuted>[];
};

// Taken from https://hyperevmscan.io/tx/0xf72cfb2c0a9f781057cd4f7beca6fc6bd9290f1d73adef1142b8ac1b0ed7186c#eventlog#37
// TODO: Add testnet endpoint v2 address when applicable
export const ENDPOINT_V2_ADDRESS = "0x3a73033c0b1407574c76bdbac67f126f6b4a9aa9";

const DST_OFT_HANDLER_ADDRESS: { [key: number]: string } = {
  // Taken from https://hyperevmscan.io/address/0x2beF20D17a17f6903017d27D1A35CC9Dc72b0888#code
  [CHAIN_IDs.HYPEREVM]: "0x2beF20D17a17f6903017d27D1A35CC9Dc72b0888",
};
("");

const SWAP_API_CALLDATA_MARKER = "73c0de";

export class OFTIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private oftRepository: OftRepository,
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
    await this.oftRepository.deleteUnfinalisedOFTEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    await this.oftRepository.deleteUnfinalisedSponsoredOFTSendEvents(
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
    const dstOftHandlerAddress = DST_OFT_HANDLER_ADDRESS[this.chainId];
    const sponsoredOFTSrcPeripheryAddress =
      SPONSORED_OFT_SRC_PERIPHERY_ADDRESS[this.chainId];

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
    let blockHashes = [];
    const oftSentTransactions = await this.getTransactions([
      ...new Set(oftSentEvents.map((event) => event.transactionHash)),
    ]);
    const filteredOftSentEvents = await this.filterTransactionsFromSwapApi(
      oftSentTransactions,
      oftSentEvents,
    );
    const filteredOftReceivedEvents =
      await this.filterTransactionsForSupportedEndpointIds(oftReceivedEvents);
    const filteredOftSentTransactionReceipts =
      await this.getTransactionsReceipts([
        ...new Set(filteredOftSentEvents.map((event) => event.transactionHash)),
      ]);
    blockHashes.push(
      ...filteredOftSentEvents.map((event) => event.blockHash),
      ...filteredOftReceivedEvents.map((event) => event.blockHash),
    );

    let sponsoredOFTSendEvents: SponsoredOFTSendLog[] = [];
    if (sponsoredOFTSrcPeripheryAddress) {
      sponsoredOFTSendEvents = getEventsFromTransactionReceipts(
        filteredOftSentTransactionReceipts,
        sponsoredOFTSrcPeripheryAddress,
        EventDecoder.decodeOFTSponsoredSendEvents,
      );
    }

    let simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[] =
      [];
    let fallbackHyperEVMFlowCompletedEvents: FallbackHyperEVMFlowCompletedLog[] =
      [];
    let arbitraryActionsExecutedEvents: ArbitraryActionsExecutedLog[] = [];
    const composeDeliveredEvents = await fetchEvents(
      this.provider,
      ENDPOINT_V2_ADDRESS,
      "event ComposeDelivered(address from, address to, bytes32 guid, uint16 index)",
      blockRange.from,
      blockRange.to,
    );
    if (composeDeliveredEvents.length > 0) {
      if (dstOftHandlerAddress) {
        const transactionReceipts = await this.getTransactionsReceipts(
          composeDeliveredEvents.map((event) => event.transactionHash),
        );
        simpleTransferFlowCompletedEvents = getEventsFromTransactionReceipts(
          transactionReceipts,
          dstOftHandlerAddress,
          EventDecoder.decodeSimpleTransferFlowCompletedEvents,
        );
        fallbackHyperEVMFlowCompletedEvents = getEventsFromTransactionReceipts(
          transactionReceipts,
          dstOftHandlerAddress,
          EventDecoder.decodeFallbackHyperEVMFlowCompletedEvents,
        );
        arbitraryActionsExecutedEvents = getEventsFromTransactionReceipts(
          transactionReceipts,
          dstOftHandlerAddress,
          EventDecoder.decodeArbitraryActionsExecutedEvents,
        );
        blockHashes.push(
          ...simpleTransferFlowCompletedEvents.map((event) => event.blockHash),
          ...fallbackHyperEVMFlowCompletedEvents.map(
            (event) => event.blockHash,
          ),
          ...arbitraryActionsExecutedEvents.map((event) => event.blockHash),
        );
      }
    }

    const blocks = await this.getBlocks([...new Set(blockHashes)]);
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
      sponsoredOFTSendEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      blocks,
    };
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
    tokenAddress: string,
  ): Promise<StoreEventsResult> {
    const {
      blocks,
      oftReceivedEvents,
      oftSentEvents,
      sponsoredOFTSendEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
    } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);
    const primaryKeyColumns = [
      "chainId",
      "blockNumber",
      "transactionHash",
      "logIndex",
    ];
    const [
      savedOftSentEvents,
      savedOftReceivedEvents,
      savedSponsoredOFTSendEvents,
      savedSimpleTransferFlowCompletedEvents,
      savedFallbackHyperEVMFlowCompletedEvents,
      savedArbitraryActionsExecutedEvents,
    ] = await Promise.all([
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
      this.oftRepository.formatAndSaveSponsoredOFTSendEvents(
        sponsoredOFTSendEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      formatAndSaveEvents(
        this.oftRepository,
        simpleTransferFlowCompletedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatSimpleTransferFlowCompletedEvent,
        entities.SimpleTransferFlowCompleted,
        primaryKeyColumns as (keyof entities.SimpleTransferFlowCompleted)[],
      ),
      formatAndSaveEvents(
        this.oftRepository,
        fallbackHyperEVMFlowCompletedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatFallbackHyperEVMFlowCompletedEvent,
        entities.FallbackHyperEVMFlowCompleted,
        primaryKeyColumns as (keyof entities.FallbackHyperEVMFlowCompleted)[],
      ),
      formatAndSaveEvents(
        this.oftRepository,
        arbitraryActionsExecutedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatArbitraryActionsExecutedEvent,
        entities.ArbitraryActionsExecuted,
        primaryKeyColumns as (keyof entities.ArbitraryActionsExecuted)[],
      ),
    ]);

    return {
      oftSentEvents: savedOftSentEvents,
      oftReceivedEvents: savedOftReceivedEvents,
      sponsoredOFTSendEvents: savedSponsoredOFTSendEvents,
      simpleTransferFlowCompletedEvents: savedSimpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents:
        savedFallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents: savedArbitraryActionsExecutedEvents,
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

  private async getTransactionsReceipts(uniqueTransactionHashes: string[]) {
    const transactionReceipts = await Promise.all(
      uniqueTransactionHashes.map(async (txHash) => {
        return this.provider.getTransactionReceipt(txHash);
      }),
    );
    const transactionReceiptsMap = transactionReceipts.reduce(
      (acc, receipt) => {
        acc[receipt.transactionHash] = receipt;
        return acc;
      },
      {} as Record<string, providers.TransactionReceipt>,
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
  ): Record<number, Date> {
    return Object.entries(blocks).reduce(
      (acc, [blockHash, block]) => {
        acc[block.number] = new Date(block.timestamp * 1000);
        return acc;
      },
      {} as Record<number, Date>,
    );
  }
}
