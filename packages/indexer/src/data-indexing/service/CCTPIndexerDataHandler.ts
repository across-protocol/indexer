import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { EventDecoder } from "../../web3/EventDecoder";
import {
  MESSAGE_TRANSMITTER_V2_ABI,
  SponsoredCCTPSrcPeripheryABI,
  TOKEN_MESSENGER_V2_ABI,
  ArbitraryEVMFlowExecutorABI,
} from "../adapter/cctp-v2/abis";
import {
  DepositForBurnEvent,
  MessageReceivedEvent,
  MessageSentLog,
  MintAndWithdrawLog,
  DepositForBurnWithBlock,
  MessageSentWithBlock,
  MessageReceivedWithBlock,
  MintAndWithdrawWithBlock,
  SponsoredDepositForBurnEvent,
  SponsoredDepositForBurnWithBlock,
  ArbitraryActionsExecutedEvent,
  ArbitraryActionsExecutedWithBlock,
} from "../adapter/cctp-v2/model";
import {
  CCTPRepository,
  BurnEventsPair,
  MintEventsPair,
} from "../../database/CctpRepository";
import {
  getIndexingStartBlockNumber,
  decodeMessage,
} from "../adapter/cctp-v2/service";

export type EvmBurnEventsPair = {
  depositForBurn: DepositForBurnEvent;
  messageSent: MessageSentLog;
};
export type EvmMintEventsPair = {
  messageReceived: MessageReceivedEvent;
  mintAndWithdraw: MintAndWithdrawLog;
};
export type FetchEventsResult = {
  burnEvents: EvmBurnEventsPair[];
  mintEvents: EvmMintEventsPair[];
  sponsoredBurnEvents: SponsoredDepositForBurnEvent[];
  arbitraryActionsExecutedEvents: ArbitraryActionsExecutedEvent[];
  blocks: Record<string, providers.Block>;
  transactionReceipts: Record<string, providers.TransactionReceipt>;
  transactions: Record<string, Transaction>;
};
export type StoreEventsResult = {};

const TOKEN_MESSENGER_ADDRESS = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESSAGE_TRANSMITTER_ADDRESS =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
// TODO: Update this address once the contract is deployed
const SPONSORED_CCTP_SRC_PERIPHERY_ADDRESS = ethers.constants.AddressZero;
// TODO: Update this address once the contract is deployed
const ARBITRARY_EVM_FLOW_EXECUTOR_ADDRESS = ethers.constants.AddressZero;
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
    const sponsoredCCTPContract = new ethers.Contract(
      SPONSORED_CCTP_SRC_PERIPHERY_ADDRESS,
      SponsoredCCTPSrcPeripheryABI,
      this.provider,
    );
    const arbitraryEVMFlowExecutorContract = new ethers.Contract(
      ARBITRARY_EVM_FLOW_EXECUTOR_ADDRESS,
      ArbitraryEVMFlowExecutorABI,
      this.provider,
    );
    const [
      depositForBurnEvents,
      messageReceivedEvents,
      sponsoredBurnEvents,
      arbitraryActionsExecutedEvents,
    ] = await Promise.all([
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
      sponsoredCCTPContract.queryFilter(
        "SponsoredDepositForBurn",
        blockRange.from,
        blockRange.to,
      ) as Promise<SponsoredDepositForBurnEvent[]>,
      arbitraryEVMFlowExecutorContract.queryFilter(
        "ArbitraryActionsExecuted",
        blockRange.from,
        blockRange.to,
      ) as Promise<ArbitraryActionsExecutedEvent[]>,
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
      });
    }
    if (mintEvents.length > 0) {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${mintEvents.length} mint events from Across Finalizer on chain ${this.chainId}`,
      });
    }
    return {
      burnEvents,
      mintEvents,
      sponsoredBurnEvents,
      arbitraryActionsExecutedEvents,
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
    burnEvents: EvmBurnEventsPair[],
    mintEvents: EvmMintEventsPair[],
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
      sponsoredBurnEvents,
      arbitraryActionsExecutedEvents,
      blocks,
    } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);

    // Convert EVM events to chain-agnostic format
    const chainAgnosticBurnEvents = burnEvents.map((pair) =>
      this.convertBurnEventsPairToChainAgnostic(pair),
    );

    const chainAgnosticMintEvents = mintEvents.map((pair) =>
      this.convertMintEventsPairToChainAgnostic(pair),
    );

    const chainAgnosticSponsoredBurnEvents = sponsoredBurnEvents.map((event) =>
      this.convertSponsoredDepositForBurnToChainAgnostic(event),
    );

    const chainAgnosticArbitraryActionsExecutedEvents =
      arbitraryActionsExecutedEvents.map((event) =>
        this.convertArbitraryActionsExecutedToChainAgnostic(event),
      );

    const [
      savedBurnEvents,
      savedMintEvents,
      savedSponsoredBurnEvents,
      savedArbitraryActionsExecutedEvents,
    ] = await Promise.all([
      this.cctpRepository.formatAndSaveBurnEvents(
        chainAgnosticBurnEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveMintEvents(
        chainAgnosticMintEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveSponsoredBurnEvents(
        chainAgnosticSponsoredBurnEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveArbitraryActionsExecutedEvents(
        chainAgnosticArbitraryActionsExecutedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
    ]);

    return {
      savedBurnEvents,
      savedMintEvents,
      savedSponsoredBurnEvents,
      savedArbitraryActionsExecutedEvents,
    };
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

  private convertSponsoredDepositForBurnToChainAgnostic(
    event: SponsoredDepositForBurnEvent,
  ): SponsoredDepositForBurnWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      nonce: event.args.nonce,
      depositor: event.args.depositor,
      finalRecipient: event.args.finalRecipient,
      deadline: event.args.deadline.toString(),
      maxBpsToSponsor: event.args.maxBpsToSponsor.toString(),
      maxUserSlippageBps: event.args.maxUserSlippageBps.toString(),
      finalToken: event.args.finalToken,
      signature: event.args.signature,
    };
  }

  private convertArbitraryActionsExecutedToChainAgnostic(
    event: ArbitraryActionsExecutedEvent,
  ): ArbitraryActionsExecutedWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      quoteNonce: event.args.quoteNonce,
      initialToken: event.args.initialToken,
      initialAmount: event.args.initialAmount.toString(),
      finalToken: event.args.finalToken,
      finalAmount: event.args.finalAmount.toString(),
    };
  }

  private convertDepositForBurnToChainAgnostic(
    event: DepositForBurnEvent,
  ): DepositForBurnWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      burnToken: event.args.burnToken,
      amount: event.args.amount.toString(),
      depositor: event.args.depositor,
      mintRecipient: event.args.mintRecipient,
      destinationDomain: event.args.destinationDomain,
      destinationTokenMessenger: event.args.destinationTokenMessenger,
      destinationCaller: event.args.destinationCaller,
      maxFee: event.args.maxFee.toString(),
      minFinalityThreshold: event.args.minFinalityThreshold,
      hookData: event.args.hookData,
    };
  }

  private convertMessageSentToChainAgnostic(
    event: MessageSentLog,
  ): MessageSentWithBlock {
    const messageBytes = ethers.utils.arrayify(event.args.message);
    const decodedMessage = decodeMessage(messageBytes);
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      message: event.args.message,
      version: decodedMessage.version,
      sourceDomain: decodedMessage.sourceDomain,
      destinationDomain: decodedMessage.destinationDomain,
      nonce: decodedMessage.nonce,
      sender: decodedMessage.sender,
      recipient: decodedMessage.recipient,
      destinationCaller: decodedMessage.destinationCaller,
      minFinalityThreshold: decodedMessage.minFinalityThreshold,
      finalityThresholdExecuted: decodedMessage.finalityThresholdExecuted,
      messageBody: decodedMessage.messageBody,
    };
  }

  private convertBurnEventsPairToChainAgnostic(
    pair: EvmBurnEventsPair,
  ): BurnEventsPair {
    return {
      depositForBurn: this.convertDepositForBurnToChainAgnostic(
        pair.depositForBurn,
      ),
      messageSent: this.convertMessageSentToChainAgnostic(pair.messageSent),
    };
  }

  private convertMessageReceivedToChainAgnostic(
    event: MessageReceivedEvent,
  ): MessageReceivedWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      caller: event.args.caller,
      sourceDomain: event.args.sourceDomain,
      nonce: event.args.nonce,
      sender: event.args.sender,
      finalityThresholdExecuted: event.args.finalityThresholdExecuted,
      messageBody: event.args.messageBody,
    };
  }

  private convertMintAndWithdrawToChainAgnostic(
    event: MintAndWithdrawLog,
  ): MintAndWithdrawWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      mintRecipient: event.args.mintRecipient,
      amount: event.args.amount.toString(),
      mintToken: event.args.mintToken,
      feeCollected: event.args.feeCollected.toString(),
    };
  }

  private convertMintEventsPairToChainAgnostic(
    pair: EvmMintEventsPair,
  ): MintEventsPair {
    return {
      messageReceived: this.convertMessageReceivedToChainAgnostic(
        pair.messageReceived,
      ),
      mintAndWithdraw: this.convertMintAndWithdrawToChainAgnostic(
        pair.mintAndWithdraw,
      ),
    };
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
        const matchedPairs: EvmBurnEventsPair[] = [];
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
      {} as Record<string, EvmBurnEventsPair[]>,
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
        const matchedPairs: EvmMintEventsPair[] = [];
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
      {} as Record<string, EvmMintEventsPair[]>,
    );
    return Object.values(mintEvents).flat();
  }
}
