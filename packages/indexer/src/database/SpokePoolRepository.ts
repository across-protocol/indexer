import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import * as utils from "../utils";
import { FetchEventsResult } from "../data-indexing/service/SpokePoolIndexerDataHandler";

export class SpokePoolRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public updateDepositEventWithIntegratorId(id: number, integratorId: string) {
    return this.postgres
      .getRepository(entities.V3FundsDeposited)
      .update({ id }, { integratorId });
  }

  private formatRelayData(
    event:
      | across.interfaces.DepositWithBlock
      | across.interfaces.FillWithBlock
      | across.interfaces.SlowFillRequestWithBlock,
  ) {
    return {
      depositId: event.depositId.toString(),
      originChainId: event.originChainId.toString(),
      depositor: event.depositor,
      recipient: event.recipient,
      inputToken: event.inputToken,
      inputAmount: event.inputAmount.toString(),
      outputToken: event.outputToken,
      outputAmount: event.outputAmount.toString(),
      exclusiveRelayer: event.exclusiveRelayer,
      exclusivityDeadline:
        event.exclusivityDeadline === 0
          ? undefined
          : new Date(event.exclusivityDeadline * 1000),
      fillDeadline: new Date(event.fillDeadline * 1000),
    };
  }

  public async formatAndSaveV3FundsDepositedEvents(
    v3FundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[],
    lastFinalisedBlock: number,
    blockTimes: Record<number, number>,
  ) {
    const formattedEvents = v3FundsDepositedEvents.map((event) => {
      const blockTimestamp = new Date(blockTimes[event.blockNumber]! * 1000);
      return {
        ...this.formatRelayData(event),
        relayHash: across.utils.getRelayHashFromEvent(event),
        destinationChainId: event.destinationChainId.toString(),
        fromLiteChain: event.fromLiteChain,
        toLiteChain: event.toLiteChain,
        message: event.message,
        messageHash: event.messageHash,
        internalHash: utils.getInternalHash(
          event,
          event.messageHash,
          event.destinationChainId,
        ),
        quoteTimestamp: new Date(event.quoteTimestamp * 1000),
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
        blockTimestamp,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.V3FundsDeposited>(
          entities.V3FundsDeposited,
          eventsChunk,
          ["relayHash", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveFilledV3RelayEvents(
    filledV3RelayEvents: across.interfaces.FillWithBlock[],
    lastFinalisedBlock: number,
    blockTimes: Record<number, number>,
  ) {
    const formattedEvents = filledV3RelayEvents.map((event) => {
      const blockTimestamp = new Date(blockTimes[event.blockNumber]! * 1000);
      return {
        ...this.formatRelayData(event),
        destinationChainId: event.destinationChainId.toString(),
        message: event.messageHash,
        relayer: event.relayer,
        repaymentChainId: event.repaymentChainId,
        internalHash: utils.getInternalHash(
          event,
          event.messageHash,
          event.destinationChainId,
        ),
        updatedRecipient: event.relayExecutionInfo.updatedRecipient,
        updatedOutputAmount:
          event.relayExecutionInfo.updatedOutputAmount.toString(),
        updatedMessage:
          event.relayExecutionInfo.updatedMessageHash ||
          event.relayExecutionInfo.updatedMessage,
        fillType: event.relayExecutionInfo.fillType,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
        blockTimestamp,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.FilledV3Relay>(
          entities.FilledV3Relay,
          eventsChunk,
          ["internalHash"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedV3SlowFillEvents(
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = requestedV3SlowFillEvents.map((event) => {
      return {
        ...this.formatRelayData(event),
        destinationChainId: event.destinationChainId.toString(),
        internalHash: utils.getInternalHash(
          event,
          event.messageHash,
          event.destinationChainId,
        ),
        message: event.messageHash,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.RequestedV3SlowFill>(
          entities.RequestedV3SlowFill,
          eventsChunk,
          ["internalHash"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedSpeedUpV3Events(
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: string]: across.interfaces.SpeedUpWithBlock[];
      };
    },
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = Object.values(requestedSpeedUpV3Events).flatMap(
      (eventsByDepositId) =>
        Object.values(eventsByDepositId).flatMap((events) =>
          events.map((event) => {
            const transactionHash = event.txnRef;
            const transactionIndex = event.txnIndex;
            delete (event as { txnRef?: string }).txnRef;
            delete (event as { txnIndex?: number }).txnIndex;
            return {
              originChainId: event.originChainId,
              depositId: event.depositId.toString(),
              depositor: event.depositor,
              updatedRecipient: event.updatedRecipient,
              updatedMessage: event.updatedMessage,
              updatedOutputAmount: event.updatedOutputAmount.toString(),
              depositorSignature: event.depositorSignature,
              transactionHash: event.txnRef,
              transactionIndex: event.txnIndex,
              logIndex: event.logIndex,
              blockNumber: event.blockNumber,
              finalised: event.blockNumber <= lastFinalisedBlock,
            };
          }),
        ),
    );
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.RequestedSpeedUpV3Deposit>(
          entities.RequestedSpeedUpV3Deposit,
          eventsChunk,
          ["depositId", "originChainId", "transactionHash", "logIndex"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRelayedRootBundleEvents(
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[],
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = relayedRootBundleEvents.map((event) => {
      return {
        chainId,
        rootBundleId: event.rootBundleId,
        relayerRefundRoot: event.relayerRefundRoot,
        slowRelayRoot: event.slowRelayRoot,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.RelayedRootBundle>(
          entities.RelayedRootBundle,
          eventsChunk,
          ["chainId", "rootBundleId"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveExecutedRelayerRefundRootEvents(
    executedRelayerRefundRootEvents: FetchEventsResult["executedRelayerRefundRootEvents"],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = executedRelayerRefundRootEvents.map((event) => {
      return {
        chainId: event.chainId,
        rootBundleId: event.rootBundleId,
        leafId: event.leafId,
        l2TokenAddress: event.l2TokenAddress,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
        refundAddresses: event.refundAddresses,
        deferredRefunds: event.deferredRefunds,
        caller: event.caller,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.ExecutedRelayerRefundRoot>(
          entities.ExecutedRelayerRefundRoot,
          eventsChunk,
          ["chainId", "rootBundleId", "leafId"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveTokensBridgedEvents(
    tokensBridgedEvents: FetchEventsResult["tokensBridgedEvents"],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = tokensBridgedEvents.map((event) => {
      return {
        chainId: event.chainId,
        leafId: event.leafId,
        l2TokenAddress: event.l2TokenAddress,
        amountToReturn: event.amountToReturn.toString(),
        caller: event.caller,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.TokensBridged>(
          entities.TokensBridged,
          eventsChunk,
          ["chainId", "leafId", "l2TokenAddress", "transactionHash"],
          ["transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async deleteUnfinalisedDepositEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "originChainId";
    const deletedDeposits = await this.deleteUnfinalisedEvents(
      chainId,
      chainIdColumn,
      lastFinalisedBlock,
      entities.V3FundsDeposited,
    );
    return deletedDeposits;
  }
}
