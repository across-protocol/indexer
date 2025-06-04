import winston from "winston";
import * as across from "@across-protocol/sdk";
import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResult,
} from "@repo/indexer-database";
import * as utils from "../utils";
import { FetchEventsResult } from "../data-indexing/service/SpokePoolIndexerDataHandler";

const { EvmAddress, SvmAddress, chainIsEvm, chainIsSvm } = across.utils;

export type StoreEventsResult = {
  deposits: SaveQueryResult<entities.V3FundsDeposited>[];
  fills: SaveQueryResult<entities.FilledV3Relay>[];
  slowFillRequests: SaveQueryResult<entities.RequestedV3SlowFill>[];
  executedRefundRoots: SaveQueryResult<entities.ExecutedRelayerRefundRoot>[];
};

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
    // Format address fields from bytes32 to specific chain format
    let depositor: string;
    let recipient: string;
    let inputToken: string;
    let outputToken: string;
    let exclusiveRelayer: string;

    // Format depositor and inputToken to origin chain format
    if (chainIsEvm(event.originChainId)) {
      depositor = EvmAddress.from(event.depositor, "base16").toEvmAddress();
      inputToken = EvmAddress.from(event.inputToken, "base16").toEvmAddress();
    } else if (chainIsSvm(event.originChainId)) {
      depositor = SvmAddress.from(event.depositor, "base16").toBase58();
      inputToken = SvmAddress.from(event.inputToken, "base16").toBase58();
    } else {
      throw new Error(`Unsupported chainId: ${event.originChainId}`);
    }

    // Format recipient, outputToken and exclusiveRelayer to destination chain format
    if (chainIsEvm(event.destinationChainId)) {
      recipient = EvmAddress.from(event.recipient, "base16").toEvmAddress();
      outputToken = EvmAddress.from(event.outputToken, "base16").toEvmAddress();
      exclusiveRelayer = EvmAddress.from(
        event.exclusiveRelayer,
        "base16",
      ).toEvmAddress();
    } else if (chainIsSvm(event.destinationChainId)) {
      recipient = SvmAddress.from(event.recipient, "base16").toBase58();
      outputToken = SvmAddress.from(event.outputToken, "base16").toBase58();
      exclusiveRelayer = SvmAddress.from(
        event.exclusiveRelayer,
        "base16",
      ).toBase58();
    } else {
      throw new Error(`Unsupported chainId: ${event.destinationChainId}`);
    }

    return {
      depositId: event.depositId.toString(),
      originChainId: event.originChainId.toString(),
      depositor,
      recipient,
      inputToken,
      inputAmount: event.inputAmount.toString(),
      outputToken,
      outputAmount: event.outputAmount.toString(),
      exclusiveRelayer,
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
      // Format relayer and updatedRecipient to destination chain format
      let relayer: string;
      let updatedRecipient: string;
      if (chainIsEvm(event.destinationChainId)) {
        relayer = EvmAddress.from(event.relayer, "base16").toEvmAddress();
        updatedRecipient = EvmAddress.from(
          event.relayExecutionInfo.updatedRecipient,
          "base16",
        ).toEvmAddress();
      } else if (chainIsSvm(event.destinationChainId)) {
        relayer = SvmAddress.from(event.relayer, "base16").toBase58();
        updatedRecipient = SvmAddress.from(
          event.relayExecutionInfo.updatedRecipient,
          "base16",
        ).toBase58();
      } else {
        throw new Error(`Unsupported chainId: ${event.destinationChainId}`);
      }

      const blockTimestamp = new Date(blockTimes[event.blockNumber]! * 1000);

      return {
        ...this.formatRelayData(event),
        destinationChainId: event.destinationChainId.toString(),
        message: event.messageHash,
        relayer,
        repaymentChainId: event.repaymentChainId,
        internalHash: utils.getInternalHash(
          event,
          event.messageHash,
          event.destinationChainId,
        ),
        updatedRecipient,
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
            return {
              originChainId: event.originChainId.toString(),
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
    const chainIdString = chainId.toString();
    const formattedEvents = relayedRootBundleEvents.map((event) => {
      return {
        chainId: chainIdString,
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
      // Format l2TokenAddress and refundAddresses to destination chain format
      let l2TokenAddress: string;
      let refundAddresses: string[];
      if (chainIsEvm(event.chainId)) {
        l2TokenAddress = EvmAddress.from(
          event.l2TokenAddress,
          "base16",
        ).toEvmAddress();
        refundAddresses = event.refundAddresses.map((address) =>
          EvmAddress.from(address, "base16").toEvmAddress(),
        );
      } else if (chainIsSvm(event.chainId)) {
        l2TokenAddress = SvmAddress.from(
          event.l2TokenAddress,
          "base16",
        ).toBase58();
        refundAddresses = event.refundAddresses.map((address) =>
          SvmAddress.from(address, "base16").toBase58(),
        );
      } else {
        throw new Error(`Unsupported chainId: ${event.chainId}`);
      }
      return {
        chainId: event.chainId.toString(),
        rootBundleId: event.rootBundleId,
        leafId: event.leafId,
        l2TokenAddress,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
        refundAddresses,
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
      // Format l2TokenAddress to destination chain format
      let l2TokenAddress: string;
      if (chainIsEvm(event.chainId)) {
        l2TokenAddress = EvmAddress.from(
          event.l2TokenAddress,
          "base16",
        ).toEvmAddress();
      } else if (chainIsSvm(event.chainId)) {
        l2TokenAddress = SvmAddress.from(
          event.l2TokenAddress,
          "base16",
        ).toBase58();
      } else {
        throw new Error(`Unsupported chainId: ${event.chainId}`);
      }
      return {
        chainId: event.chainId.toString(),
        leafId: event.leafId,
        l2TokenAddress,
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
