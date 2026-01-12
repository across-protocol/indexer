import winston from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
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
import {
  getCctpDestinationChainFromDomain,
  isHypercoreWithdraw,
  isProductionNetwork,
} from "../data-indexing/adapter/cctp-v2/service";
import { formatFromAddressToChainFormat } from "../utils";
import {
  SimpleTransferFlowCompletedLog,
  ArbitraryActionsExecutedLog,
  FallbackHyperEVMFlowCompletedLog,
} from "../data-indexing/model";

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
    contractAddress?: string,
  ) {
    const chainIdColumn = "chainId";
    const [
      depositForBurnEvents,
      messageSentEvents,
      mintAndWithdrawEvents,
      messageReceivedEvents,
      sponsoredDepositForBurnEvents,
      simpleTransferFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
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
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.ArbitraryActionsExecuted,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.FallbackHyperEVMFlowCompleted,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SponsoredAccountActivation,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowInitialized,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowFinalized,
        contractAddress,
      ),
    ]);

    return {
      depositForBurnEvents,
      messageSentEvents,
      mintAndWithdrawEvents,
      messageReceivedEvents,
      sponsoredDepositForBurnEvents,
      simpleTransferFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
    };
  }

  public async deleteHypercoreCctpWithdrawalsForMessageReceived(
    deletedMessageReceivedEvents: entities.MessageReceived[],
  ) {
    if (deletedMessageReceivedEvents.length === 0) {
      return 0;
    }

    const hypercoreCctpWithdrawRepository = this.postgres.getRepository(
      entities.HypercoreCctpWithdraw,
    );

    let totalDeleted = 0;
    for (const deletedEvent of deletedMessageReceivedEvents) {
      const result = await hypercoreCctpWithdrawRepository.delete({
        mintEventId: deletedEvent.id,
      });
      const deletedCount = result.affected || 0;

      if (deletedCount > 0) {
        totalDeleted += deletedCount;
        this.logger.debug({
          at: "CCTPRepository#deleteHypercoreCctpWithdrawalsForMessageReceived",
          message: `Deleted ${deletedCount} HyperCore CCTP withdrawal(s) for MessageReceived event`,
          messageReceivedId: deletedEvent.id,
          transactionHash: deletedEvent.transactionHash,
        });
      }
    }

    if (totalDeleted > 0) {
      this.logger.info({
        at: "CCTPRepository#deleteHypercoreCctpWithdrawalsForMessageReceived",
        message: `Total deleted HyperCore CCTP withdrawals: ${totalDeleted}`,
        deletedMessageReceivedCount: deletedMessageReceivedEvents.length,
      });
    }

    return totalDeleted;
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

  public async formatAndSaveArbitraryActionsExecutedEvents(
    arbitraryActionsExecutedEvents: ArbitraryActionsExecutedLog[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.ArbitraryActionsExecuted>[] =
      arbitraryActionsExecutedEvents.map((event) => {
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          quoteNonce: event.args.quoteNonce,
          initialToken: event.args.initialToken,
          initialAmount: event.args.initialAmount.toString(),
          finalToken: event.args.finalToken,
          finalAmount: event.args.finalAmount.toString(),
          finalised: event.blockNumber <= lastFinalisedBlock,
          contractAddress: event.address,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.ArbitraryActionsExecuted>(
          entities.ArbitraryActionsExecuted,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveFallbackHyperEVMFlowCompletedEvents(
    fallbackHyperEVMFlowCompletedEvents: FallbackHyperEVMFlowCompletedLog[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.FallbackHyperEVMFlowCompleted>[] =
      fallbackHyperEVMFlowCompletedEvents.map((event) => {
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          quoteNonce: event.args.quoteNonce,
          finalRecipient: event.args.finalRecipient,
          finalToken: event.args.finalToken,
          evmAmountIn: event.args.evmAmountIn.toString(),
          bridgingFeesIncurred: event.args.bridgingFeesIncurred.toString(),
          evmAmountSponsored: event.args.evmAmountSponsored.toString(),
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.FallbackHyperEVMFlowCompleted>(
          entities.FallbackHyperEVMFlowCompleted,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
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
          quoteNonce: event.quoteNonce,
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
    if (formattedEvents.length > 0) {
      this.logger.debug({
        at: "CCTPRepository#formatAndSaveSponsoredBurnEvents",
        message: `Saving ${formattedEvents.length} sponsored burn events`,
        events: formattedEvents.map((e) => ({
          chainId: e.chainId,
          blockNumber: e.blockNumber,
          transactionHash: e.transactionHash,
          logIndex: e.logIndex,
          finalised: e.finalised,
        })),
      });
    }
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

  public async formatAndSaveHypercoreCctpWithdrawals(
    savedMintEvents: {
      messageReceivedEvent: SaveQueryResult<entities.MessageReceived>;
      mintAndWithdrawEvent: SaveQueryResult<entities.MintAndWithdraw>;
    }[],
    destinationChainId: number,
  ) {
    const hypercoreWithdrawals: Partial<entities.HypercoreCctpWithdraw>[] = [];

    for (const { messageReceivedEvent } of savedMintEvents) {
      const result = isHypercoreWithdraw(messageReceivedEvent.data.messageBody);

      // Skip if it's not a valid HyperCore withdrawal
      if (!result.isValid || !result.decodedHookData) {
        continue;
      }

      const isProductionChain = isProductionNetwork(destinationChainId);
      const originChainId = getCctpDestinationChainFromDomain(
        messageReceivedEvent.data.sourceDomain,
        isProductionChain,
      );

      hypercoreWithdrawals.push({
        fromAddress: result.decodedHookData.fromAddress,
        hypercoreNonce: result.decodedHookData.hyperCoreNonce.toString(),
        originChainId: originChainId.toString(),
        destinationChainId: destinationChainId.toString(),
        versionId: result.decodedHookData.versionId,
        declaredLength: result.decodedHookData.declaredLength,
        magicBytes: result.decodedHookData.magicBytes,
        userData: result.decodedHookData.userData,
        mintTxnHash: messageReceivedEvent.data.transactionHash,
        mintEventId: messageReceivedEvent.data.id,
      });
    }

    if (hypercoreWithdrawals.length === 0) {
      return [];
    }

    const chunkedEvents = across.utils.chunk(
      hypercoreWithdrawals,
      this.chunkSize,
    );
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.HypercoreCctpWithdraw>(
          entities.HypercoreCctpWithdraw,
          eventsChunk,
          ["fromAddress", "hypercoreNonce"],
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
