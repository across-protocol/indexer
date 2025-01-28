import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import * as utils from "../utils";

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
      inputAmount: event.inputAmount.toString(),
      outputAmount: event.outputAmount.toString(),
      fillDeadline: new Date(event.fillDeadline * 1000),
      exclusivityDeadline:
        event.exclusivityDeadline === 0
          ? undefined
          : new Date(event.exclusivityDeadline * 1000),
    };
  }

  public async formatAndSaveV3FundsDepositedEvents(
    v3FundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[],
    lastFinalisedBlock: number,
    blockTimes: Record<number, number>,
  ) {
    const formattedEvents = v3FundsDepositedEvents.map((event) => {
      // delete fields that are not needed for the database table
      delete event.speedUpSignature;
      delete event.updatedRecipient;
      delete event.updatedOutputAmount;
      delete event.updatedMessage;
      const blockTimestamp = new Date(blockTimes[event.blockNumber]! * 1000);
      return {
        ...event,
        relayHash: across.utils.getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        quoteTimestamp: new Date(event.quoteTimestamp * 1000),
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
          ["relayHash", "blockNumber", "logIndex"],
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
        ...Object.keys(event).reduce(
          (acc, key) => {
            if (key !== "relayExecutionInfo") {
              acc[key] = (event as any)[key];
            }
            return acc;
          },
          {} as { [key: string]: any },
        ),
        relayHash: across.utils.getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        updatedRecipient: event.relayExecutionInfo.updatedRecipient,
        updatedOutputAmount:
          event.relayExecutionInfo.updatedOutputAmount.toString(),
        updatedMessage: event.relayExecutionInfo.updatedMessage,
        fillType: event.relayExecutionInfo.fillType,
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
          ["relayHash"],
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
        ...event,
        relayHash: across.utils.getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.RequestedV3SlowFill>(
          entities.RequestedV3SlowFill,
          eventsChunk,
          ["depositId", "originChainId"],
          ["relayHash", "transactionHash"],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedSpeedUpV3Events(
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: number]: across.interfaces.SpeedUpWithBlock[];
      };
    },
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = Object.values(requestedSpeedUpV3Events).flatMap(
      (eventsByDepositId) =>
        Object.values(eventsByDepositId).flatMap((events) =>
          events.map((event) => {
            return {
              ...event,
              depositId: event.depositId.toString(),
              updatedOutputAmount: event.updatedOutputAmount.toString(),
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
        ...event,
        chainId,
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
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = executedRelayerRefundRootEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
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
    tokensBridgedEvents: across.interfaces.TokensBridged[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = tokensBridgedEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
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
}
