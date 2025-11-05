import winston from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";

import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResult,
} from "@repo/indexer-database";

import {
  DepositForBurnWithBlock,
  MessageSentWithBlock,
  MessageReceivedWithBlock,
  MintAndWithdrawWithBlock,
  SponsoredDepositForBurnWithBlock,
} from "../data-indexing/adapter/cctp-v2/model";
import { getCctpDestinationChainFromDomain } from "../data-indexing/adapter/cctp-v2/service";
import { formatFromAddressToChainFormat } from "../utils";
import { SimpleTransferFlowCompletedWithBlock } from "../data-indexing/model/hyperEvmExecutor";

// Chain-agnostic types - both EVM and SVM handlers must convert to these
export type BurnEventsPair = {
  depositForBurn: DepositForBurnWithBlock;
  messageSent: MessageSentWithBlock;
};

export type MintEventsPair = {
  messageReceived: MessageReceivedWithBlock;
  mintAndWithdraw: MintAndWithdrawWithBlock;
};

export class CCTPRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedCCTPEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [
      depositForBurnEvents,
      messageSentEvents,
      mintAndWithdrawEvents,
      messageReceivedEvents,
      sponsoredDepositForBurnEvents,
      simpleTransferFlowCompletedEvents,
    ] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.DepositForBurn,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.MessageSent,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.MintAndWithdraw,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.MessageReceived,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SponsoredDepositForBurn,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SimpleTransferFlowCompleted,
      ),
    ]);

    return {
      depositForBurnEvents,
      messageSentEvents,
      mintAndWithdrawEvents,
      messageReceivedEvents,
      sponsoredDepositForBurnEvents,
      simpleTransferFlowCompletedEvents,
    };
  }

  public async formatAndSaveSimpleTransferFlowCompletedEvents(
    simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SimpleTransferFlowCompleted>[] =
      simpleTransferFlowCompletedEvents.map((event) => {
        let finalRecipient = event.finalRecipient;
        if (
          chainId === CHAIN_IDs.HYPEREVM ||
          chainId === CHAIN_IDs.HYPEREVM_TESTNET
        ) {
          finalRecipient = formatFromAddressToChainFormat(
            across.utils.toAddressType(event.finalRecipient, chainId),
            chainId,
          );
        } else {
          this.logger.warn({
            at: "CCTPRepository#formatAndSaveSimpleTransferFlowCompletedEvents",
            message: `formatting SimpleTransferFlowCompleted event for unsupported chainId ${chainId}, finalRecipient address may be incorrect`,
          });
        }

        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,

          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),

          quoteNonce: event.quoteNonce,
          finalRecipient: finalRecipient,
          finalToken: event.finalToken,
          evmAmountIn: event.evmAmountIn,
          bridgingFeesIncurred: event.bridgingFeesIncurred,
          evmAmountSponsored: event.evmAmountSponsored,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
          entities.SimpleTransferFlowCompleted,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveBurnEvents(
    burnEvents: BurnEventsPair[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const savedEvents: {
      depositForBurnEvent: SaveQueryResult<entities.DepositForBurn>;
      messageSentEvent: SaveQueryResult<entities.MessageSent>;
    }[] = [];
    const chunkedEvents = across.utils.chunk(burnEvents, this.chunkSize);
    for (const eventsChunk of chunkedEvents) {
      const savedEventsChunk = await Promise.all(
        eventsChunk.map(async (eventsPair) => {
          return this.formatAndSaveBurnEventsPair(
            eventsPair,
            lastFinalisedBlock,
            chainId,
            blockDates,
          );
        }),
      );
      savedEvents.push(...savedEventsChunk);
    }
    return savedEvents;
  }

  public async formatAndSaveSponsoredBurnEvents(
    sponsoredBurnEvents: SponsoredDepositForBurnWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SponsoredDepositForBurn>[] =
      sponsoredBurnEvents.map((event) => {
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          nonce: event.nonce,
          originSender: event.originSender,
          finalRecipient: event.finalRecipient,
          quoteDeadline: event.quoteDeadline,
          maxBpsToSponsor: event.maxBpsToSponsor,
          maxUserSlippageBps: event.maxUserSlippageBps,
          finalToken: event.finalToken,
          signature: event.signature,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SponsoredDepositForBurn>(
          entities.SponsoredDepositForBurn,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMintEvents(
    mintEvents: MintEventsPair[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const savedEvents: {
      messageReceivedEvent: SaveQueryResult<entities.MessageReceived>;
      mintAndWithdrawEvent: SaveQueryResult<entities.MintAndWithdraw>;
    }[] = [];
    const chunkedEvents = across.utils.chunk(mintEvents, this.chunkSize);
    for (const eventsChunk of chunkedEvents) {
      const savedEventsChunk = await Promise.all(
        eventsChunk.map(async (eventsPair) => {
          return this.formatAndSaveMintEventsPair(
            eventsPair,
            lastFinalisedBlock,
            chainId,
            blockDates,
          );
        }),
      );
      savedEvents.push(...savedEventsChunk);
    }
    return savedEvents;
  }

  public async formatAndSaveBurnEventsPair(
    burnEventsPair: BurnEventsPair,
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const { depositForBurn, messageSent } = burnEventsPair;
    const [depositForBurnEvents, messageSentEvents] = await Promise.all([
      this.formatAndSaveDepositForBurnEvents(
        [depositForBurn],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
      this.formatAndSaveMessageSentEvents(
        [messageSent],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
    ]);
    return {
      depositForBurnEvent:
        depositForBurnEvents[0] as SaveQueryResult<entities.DepositForBurn>,
      messageSentEvent:
        messageSentEvents[0] as SaveQueryResult<entities.MessageSent>,
    };
  }

  public async formatAndSaveMintEventsPair(
    mintEventsPair: MintEventsPair,
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const { messageReceived, mintAndWithdraw } = mintEventsPair;
    const [messageReceivedEvents, mintAndWithdrawEvents] = await Promise.all([
      this.formatAndSaveMessageReceivedEvents(
        [messageReceived],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
      this.formatAndSaveMintAndWithdrawEvents(
        [mintAndWithdraw],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
    ]);
    return {
      messageReceivedEvent:
        messageReceivedEvents[0] as SaveQueryResult<entities.MessageReceived>,
      mintAndWithdrawEvent:
        mintAndWithdrawEvents[0] as SaveQueryResult<entities.MintAndWithdraw>,
    };
  }

  public async formatAndSaveDepositForBurnEvents(
    depositForBurnEvents: DepositForBurnWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.DepositForBurn>[] =
      depositForBurnEvents.map((event, index) => {
        const destinationChainId = getCctpDestinationChainFromDomain(
          event.destinationDomain,
        );

        const mintRecipientAddressType = across.utils.toAddressType(
          event.mintRecipient,
          destinationChainId,
        );
        const mintRecipient = formatFromAddressToChainFormat(
          mintRecipientAddressType,
          destinationChainId,
        );

        const tokenMessengerAddressType = across.utils.toAddressType(
          event.destinationTokenMessenger,
          destinationChainId,
        );
        const tokenMessenger = formatFromAddressToChainFormat(
          tokenMessengerAddressType,
          destinationChainId,
        );

        const destinationCallerAddressType = across.utils.toAddressType(
          event.destinationCaller,
          destinationChainId,
        );
        const destinationCaller = formatFromAddressToChainFormat(
          destinationCallerAddressType,
          destinationChainId,
        );

        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,

          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),

          amount: event.amount,
          burnToken: event.burnToken,
          depositor: event.depositor,
          destinationCaller,
          maxFee: event.maxFee,
          destinationDomain: event.destinationDomain,
          destinationTokenMessenger: tokenMessenger,
          mintRecipient,
          minFinalityThreshold: event.minFinalityThreshold,
          hookData: event.hookData,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
          entities.DepositForBurn,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMessageSentEvents(
    messageSentEvents: MessageSentWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.MessageSent>[] =
      messageSentEvents.map((event) => {
        const destinationChainId = getCctpDestinationChainFromDomain(
          event.destinationDomain,
        );

        const senderAddressType = across.utils.toAddressType(
          event.sender,
          chainId,
        );
        const sender = formatFromAddressToChainFormat(
          senderAddressType,
          chainId,
        );

        const recipientAddressType = across.utils.toAddressType(
          event.recipient,
          destinationChainId,
        );
        const recipient = formatFromAddressToChainFormat(
          recipientAddressType,
          destinationChainId,
        );

        const destinationCallerAddressType = across.utils.toAddressType(
          event.destinationCaller,
          destinationChainId,
        );
        const destinationCaller = formatFromAddressToChainFormat(
          destinationCallerAddressType,
          destinationChainId,
        );

        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          message: event.message,
          version: event.version,
          sourceDomain: event.sourceDomain,
          destinationDomain: event.destinationDomain,
          nonce: event.nonce,
          sender,
          recipient,
          destinationCaller,
          minFinalityThreshold: event.minFinalityThreshold,
          finalityThresholdExecuted: event.finalityThresholdExecuted,
          messageBody: event.messageBody,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MessageSent>(
          entities.MessageSent,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMessageReceivedEvents(
    messageReceivedEvents: MessageReceivedWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.MessageReceived>[] =
      messageReceivedEvents.map((event) => {
        const sourceChainId = getCctpDestinationChainFromDomain(
          event.sourceDomain,
        );
        const senderAddressType = across.utils.toAddressType(
          event.sender,
          sourceChainId,
        );
        const sender = formatFromAddressToChainFormat(
          senderAddressType,
          sourceChainId,
        );
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          caller: event.caller,
          sourceDomain: event.sourceDomain,
          nonce: event.nonce,
          sender,
          finalityThresholdExecuted: event.finalityThresholdExecuted,
          messageBody: event.messageBody,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MessageReceived>(
          entities.MessageReceived,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMintAndWithdrawEvents(
    mintAndWithdrawEvents: MintAndWithdrawWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.MintAndWithdraw>[] =
      mintAndWithdrawEvents.map((event) => {
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          mintRecipient: event.mintRecipient,
          amount: event.amount,
          mintToken: event.mintToken,
          feeCollected: event.feeCollected,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MintAndWithdraw>(
          entities.MintAndWithdraw,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  private formatTransactionData(event: ethers.providers.Log | ethers.Event) {
    return {
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
    };
  }
}
