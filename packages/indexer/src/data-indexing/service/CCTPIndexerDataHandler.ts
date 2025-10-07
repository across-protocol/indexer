import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";
import { getDeployedBlockNumber } from "@across-protocol/contracts";

import { entities } from "@repo/indexer-database";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { EventDecoder } from "../../web3/EventDecoder";
import {
  MESSAGE_TRANSMITTER_V2_ABI,
  TOKEN_MESSENGER_V2_ABI,
} from "../adapter/cctp-v2/abis";
import {
  DepositForBurnEvent,
  MessageReceivedEvent,
  MessageSentLog,
  MintAndWithdrawLog,
} from "../adapter/cctp-v2/model";
import { CCTPRepository } from "../../database/CctpRepository";
import { getIndexingStartBlockNumber } from "../adapter/cctp-v2/service";

export type BurnEventsPair = {
  depositForBurn: DepositForBurnEvent;
  messageSent: MessageSentLog;
};
export type MintEventsPair = {
  messageReceived: MessageReceivedEvent;
  mintAndWithdraw: MintAndWithdrawLog;
};
export type FetchEventsResult = {
  burnEvents: BurnEventsPair[];
  mintEvents: MintEventsPair[];
  blocks: Record<string, providers.Block>;
  transactionReceipts: Record<string, providers.TransactionReceipt>;
  transactions: Record<string, Transaction>;
};
export type StoreEventsResult = {};

export type FillCallsFailedPair = {
  fill: entities.FilledV3Relay;
  callsFailed: entities.CallsFailed;
};

const TOKEN_MESSENGER_ADDRESS = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESSAGE_TRANSMITTER_ADDRESS =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const SWAP_API_CALLDATA_MARKER = "73c0de";
const WHITELISTED_FINALIZERS = ["0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D"];

export class CCTPIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private cctpRepository: CCTPRepository,
  ) {
    this.isInitialized = false;
  }

  private initialize() {}

  public getDataIdentifier() {
    return `cctp:v2:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getIndexingStartBlockNumber(this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#CCTPIndexerDataHandler#processBlockRange",
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
    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    const timeToStoreEvents = performance.now();
    const deletedEvents = await this.cctpRepository.deleteUnfinalisedCCTPEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    const timeToDeleteEvents = performance.now();
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#CCTPIndexerDataHandler#processBlockRange",
      message: "System Time Log for CCTPIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - startPerfTime,
      timeToDeleteEvents: timeToDeleteEvents - timeToStoreEvents,
    });
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const tokenMessengerContract = new ethers.Contract(
      TOKEN_MESSENGER_ADDRESS,
      TOKEN_MESSENGER_V2_ABI,
      this.provider,
    );
    const messageTransmitterContract = new ethers.Contract(
      MESSAGE_TRANSMITTER_ADDRESS,
      MESSAGE_TRANSMITTER_V2_ABI,
      this.provider,
    );
    const [depositForBurnEvents, messageReceivedEvents] = await Promise.all([
      tokenMessengerContract.queryFilter(
        "DepositForBurn",
        blockRange.from,
        blockRange.to,
      ) as Promise<DepositForBurnEvent[]>,
      messageTransmitterContract.queryFilter(
        "MessageReceived",
        blockRange.from,
        blockRange.to,
      ) as Promise<MessageReceivedEvent[]>,
    ]);
    const transactions = await this.getTransactions([
      ...new Set(depositForBurnEvents.map((event) => event.transactionHash)),
    ]);
    const filteredDepositForBurnEvents =
      await this.filterTransactionsFromSwapApi(
        transactions,
        depositForBurnEvents,
      );
    const filteredMessageReceivedEvents =
      this.filterTransactionsFromAcrossFinalizer(messageReceivedEvents);
    const [transactionReceipts, blocks] = await Promise.all([
      this.getTransactionsReceipts([
        ...new Set([
          ...filteredDepositForBurnEvents.map((event) => event.transactionHash),
          ...filteredMessageReceivedEvents.map(
            (event) => event.transactionHash,
          ),
        ]),
      ]),
      this.getBlocks([
        ...new Set([
          ...filteredDepositForBurnEvents.map((event) => event.blockHash),
          ...filteredMessageReceivedEvents.map((event) => event.blockHash),
        ]),
      ]),
    ]);
    const messageSentEvents = this.getMessageSentEventsFromTransactionReceipts(
      this.getTransactionReceiptsByTransactionHashes(transactionReceipts, [
        ...new Set(
          filteredDepositForBurnEvents.map((event) => event.transactionHash),
        ),
      ]),
      MESSAGE_TRANSMITTER_ADDRESS,
    );
    const mintAndWithdrawEvents =
      this.getMintAndWithdrawEventsFromTransactionReceipts(
        this.getTransactionReceiptsByTransactionHashes(transactionReceipts, [
          ...new Set(
            filteredMessageReceivedEvents.map((event) => event.transactionHash),
          ),
        ]),
        TOKEN_MESSENGER_ADDRESS,
      );
    const burnEvents = await this.matchDepositForBurnWithMessageSentEvents(
      filteredDepositForBurnEvents,
      messageSentEvents,
    );
    const mintEvents = await this.matchMessageReceivedWithMintAndWithdrawEvents(
      filteredMessageReceivedEvents,
      mintAndWithdrawEvents,
    );

    this.runChecks(burnEvents, mintEvents);

    if (burnEvents.length > 0) {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${burnEvents.length} burn events from Swap API on chain ${this.chainId}`,
        // burnEvents,
      });
    }
    if (mintEvents.length > 0) {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${mintEvents.length} mint events from Across Finalizer on chain ${this.chainId}`,
        // mintEvents,
      });
    }
    return {
      burnEvents,
      mintEvents,
      blocks,
      transactionReceipts,
      transactions,
    };
  }

  private getTransactionReceiptsByTransactionHashes(
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    transactionHashes: string[],
  ) {
    return Object.entries(transactionReceipts).reduce(
      (acc, [transactionHash, transactionReceipt]) => {
        if (transactionHashes.includes(transactionHash)) {
          acc[transactionHash] = transactionReceipt;
        }
        return acc;
      },
      {} as Record<string, providers.TransactionReceipt>,
    );
  }

  private async filterTransactionsFromSwapApi(
    transactions: Record<string, Transaction>,
    depositForBurnEvents: DepositForBurnEvent[],
  ) {
    const transactionHashes = Object.values(transactions)
      .filter((transaction) => {
        return transaction.data.includes(SWAP_API_CALLDATA_MARKER);
      })
      .map((transaction) => transaction.hash);

    return depositForBurnEvents.filter((event) => {
      return transactionHashes.includes(event.transactionHash);
    });
  }

  private filterTransactionsFromAcrossFinalizer(
    messageReceivedEvents: MessageReceivedEvent[],
  ) {
    return messageReceivedEvents.filter((event) => {
      return WHITELISTED_FINALIZERS.includes(event.args.caller);
    });
  }

  private runChecks(
    burnEvents: BurnEventsPair[],
    mintEvents: MintEventsPair[],
  ) {
    for (const burnEventsPair of burnEvents) {
      if (!burnEventsPair.depositForBurn || !burnEventsPair.messageSent) {
        this.logger.error({
          at: "CCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of burn events for tx hash`,
          notificationPath: "across-indexer-error",
          burnEvents,
        });
      }
    }
    for (const mintEventsPair of mintEvents) {
      if (!mintEventsPair.messageReceived || !mintEventsPair.mintAndWithdraw) {
        this.logger.error({
          at: "CCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of mint events for tx hash`,
          notificationPath: "across-indexer-error",
          mintEvents,
        });
      }
    }
  }

  private getMessageSentEventsFromTransactionReceipts(
    transactionReceipts: Record<string, ethers.providers.TransactionReceipt>,
    messageTransmitterAddress: string,
  ) {
    const events: MessageSentLog[] = [];

    for (const txHash of Object.keys(transactionReceipts)) {
      const transactionReceipt = transactionReceipts[
        txHash
      ] as providers.TransactionReceipt;
      const messageSentEvents: MessageSentLog[] =
        EventDecoder.decodeCCTPMessageSentEvents(
          transactionReceipt,
          messageTransmitterAddress,
        );
      if (messageSentEvents.length > 0) {
        events.push(...messageSentEvents);
      }
    }

    return events;
  }

  private getMintAndWithdrawEventsFromTransactionReceipts(
    transactionReceipts: Record<string, ethers.providers.TransactionReceipt>,
    tokenMessengerAddress: string,
  ) {
    const events: MintAndWithdrawLog[] = [];

    for (const txHash of Object.keys(transactionReceipts)) {
      const transactionReceipt = transactionReceipts[
        txHash
      ] as providers.TransactionReceipt;
      const mintAndWithdrawEvents: MintAndWithdrawLog[] =
        EventDecoder.decodeCCTPMintAndWithdrawEvents(
          transactionReceipt,
          tokenMessengerAddress,
        );
      if (mintAndWithdrawEvents.length > 0) {
        events.push(...mintAndWithdrawEvents);
      }
    }

    return events;
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

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const {
      burnEvents,
      mintEvents,
      blocks,
      transactionReceipts,
      transactions,
    } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);

    const [savedBurnEvents, savedMintEvents] = await Promise.all([
      this.cctpRepository.formatAndSaveBurnEvents(
        burnEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveMintEvents(
        mintEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
    ]);
    return {
      savedBurnEvents,
      savedMintEvents,
    };
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

  private async matchDepositForBurnWithMessageSentEvents(
    depositForBurnEvents: DepositForBurnEvent[],
    messageSentEvents: MessageSentLog[],
  ) {
    const depositForBurnEventsMap = depositForBurnEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, DepositForBurnEvent[]>,
    );
    const messageSentEventsMap = messageSentEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MessageSentLog[]>,
    );
    const transactionHashes = Object.keys(depositForBurnEventsMap);
    const burnEvents = transactionHashes.reduce(
      (acc, txHash) => {
        const sortedDepositForBurn = (
          depositForBurnEventsMap[txHash] as DepositForBurnEvent[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const sortedMessageSent = (
          messageSentEventsMap[txHash] as MessageSentLog[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const matchedPairs: BurnEventsPair[] = [];
        const matchedMessageSentLogIndexes = new Set<number>();

        sortedDepositForBurn.forEach((depositForBurn) => {
          const matchedMessageSent = sortedMessageSent.find(
            (messageSent) =>
              messageSent.logIndex < depositForBurn.logIndex &&
              !matchedMessageSentLogIndexes.has(messageSent.logIndex),
          );

          if (matchedMessageSent) {
            matchedPairs.push({
              depositForBurn,
              messageSent: matchedMessageSent,
            });
            matchedMessageSentLogIndexes.add(matchedMessageSent.logIndex);
          }
        });
        acc[txHash] = matchedPairs;
        return acc;
      },
      {} as Record<string, BurnEventsPair[]>,
    );
    return Object.values(burnEvents).flat();
  }

  private async matchMessageReceivedWithMintAndWithdrawEvents(
    messageReceivedEvents: MessageReceivedEvent[],
    mintAndWithdrawEvents: MintAndWithdrawLog[],
  ) {
    const messageReceivedEventsMap = messageReceivedEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MessageReceivedEvent[]>,
    );
    const mintAndWithdrawEventsMap = mintAndWithdrawEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MintAndWithdrawLog[]>,
    );
    const transactionHashes = Object.keys(messageReceivedEventsMap);
    const mintEvents = transactionHashes.reduce(
      (acc, txHash) => {
        const sortedMessageReceived = (
          messageReceivedEventsMap[txHash] as MessageReceivedEvent[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const sortedMintAndWithdraw = (
          mintAndWithdrawEventsMap[txHash] as MintAndWithdrawLog[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const matchedPairs: MintEventsPair[] = [];
        const matchedMintAndWithdrawLogIndexes = new Set<number>();

        sortedMessageReceived.forEach((messageReceived) => {
          const matchedMintAndWithdraw = sortedMintAndWithdraw.find(
            (mintAndWithdraw) =>
              mintAndWithdraw.logIndex < messageReceived.logIndex &&
              !matchedMintAndWithdrawLogIndexes.has(mintAndWithdraw.logIndex),
          );

          if (matchedMintAndWithdraw) {
            matchedPairs.push({
              messageReceived,
              mintAndWithdraw: matchedMintAndWithdraw,
            });
            matchedMintAndWithdrawLogIndexes.add(
              matchedMintAndWithdraw.logIndex,
            );
          }
        });
        acc[txHash] = matchedPairs;
        return acc;
      },
      {} as Record<string, MintEventsPair[]>,
    );
    return Object.values(mintEvents).flat();
  }
}
