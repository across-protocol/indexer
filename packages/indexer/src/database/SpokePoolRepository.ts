import winston from "winston";
import * as across from "@across-protocol/sdk";
import { getRelayHashFromEvent } from "@across-protocol/sdk/dist/cjs/utils/SpokeUtils";
import { DataSource, entities, utils } from "@repo/indexer-database";

export class SpokePoolRepository extends utils.BaseRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    throwError: boolean,
    private chunkSize = 2000,
  ) {
    super(postgres, logger, throwError);
  }

  private formatRelayData(
    event:
      | across.interfaces.DepositWithBlock
      | across.interfaces.FillWithBlock
      | across.interfaces.SlowFillRequestWithBlock,
  ) {
    return {
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
    v3FundsDepositedEvents: across.interfaces.DepositWithBlock[],
    throwError?: boolean,
  ) {
    const formattedEvents = v3FundsDepositedEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        quoteTimestamp: new Date(event.quoteTimestamp * 1000),
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insert(entities.V3FundsDeposited, eventsChunk, throwError),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveFilledV3RelayEvents(
    filledV3RelayEvents: across.interfaces.FillWithBlock[],
    throwError?: boolean,
  ) {
    const formattedEvents = filledV3RelayEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        relayExecutionInfo: {
          ...event.relayExecutionInfo,
          updatedOutputAmount:
            event.relayExecutionInfo.updatedOutputAmount.toString(),
        },
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insert(entities.FilledV3Relay, eventsChunk, throwError),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedV3SlowFillEvents(
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[],
    throwError?: boolean,
  ) {
    const formattedEvents = requestedV3SlowFillEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
      };
    });
    return this.insert(
      entities.RequestedV3SlowFill,
      formattedEvents,
      throwError,
    );
  }

  public async formatAndSaveRequestedSpeedUpV3Events(
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: number]: across.interfaces.SpeedUpWithBlock[];
      };
    },
    throwError?: boolean,
  ) {
    const formattedEvents = Object.values(requestedSpeedUpV3Events).flatMap(
      (eventsByDepositId) =>
        Object.values(eventsByDepositId).flatMap((events) =>
          events.map((event) => {
            return {
              ...event,
              updatedOutputAmount: event.updatedOutputAmount.toString(),
            };
          }),
        ),
    );
    await this.insert(
      entities.RequestedSpeedUpV3Deposit,
      formattedEvents,
      throwError,
    );
  }

  public async formatAndSaveRelayedRootBundleEvents(
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[],
    chainId: number,
    throwError?: boolean,
  ) {
    const formattedEvents = relayedRootBundleEvents.map((event) => {
      return { ...event, chainId };
    });
    await this.insert(entities.RelayedRootBundle, formattedEvents, throwError);
  }

  public async formatAndSaveExecutedRelayerRefundRootEvents(
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[],
    throwError?: boolean,
  ) {
    const formattedEvents = executedRelayerRefundRootEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
      };
    });
    return this.insert(
      entities.ExecutedRelayerRefundRoot,
      formattedEvents,
      throwError,
    );
  }

  public async formatAndSaveTokensBridgedEvents(
    tokensBridgedEvents: across.interfaces.TokensBridged[],
    throwError?: boolean,
  ) {
    const formattedEvents = tokensBridgedEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
      };
    });
    await this.insert(entities.TokensBridged, formattedEvents, throwError);
  }
}
