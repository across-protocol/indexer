import winston from "winston";
import * as across from "@across-protocol/sdk";
import { getRelayHashFromEvent } from "@across-protocol/sdk/dist/cjs/utils/SpokeUtils";
import {
  DataSource,
  ExecutedRelayerRefundRoot,
  FilledV3Relay,
  RelayedRootBundle,
  RequestedV3SlowFill,
  TokensBridged,
  V3FundsDeposited,
} from "@repo/indexer-database";

export class SpokePoolRepository {
  constructor(
    private postgres: DataSource,
    private logger: winston.Logger,
    private chunkSize = 2000,
  ) {}

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
    throwError = false,
  ) {
    const v3FundsDepositedRepository =
      this.postgres.getRepository(V3FundsDeposited);
    const formattedEvents = v3FundsDepositedEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        quoteTimestamp: new Date(event.quoteTimestamp * 1000),
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    try {
      await Promise.all(
        chunkedEvents.map((eventsChunk) =>
          v3FundsDepositedRepository.insert(eventsChunk),
        ),
      );
      this.logger.info(
        `Saved ${v3FundsDepositedEvents.length} V3FundsDeposited events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving V3FundsDeposited events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveFilledV3RelayEvents(
    filledV3RelayEvents: across.interfaces.FillWithBlock[],
    throwError = false,
  ) {
    const filledV3RelayRepository = this.postgres.getRepository(FilledV3Relay);
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
    try {
      await Promise.all(
        chunkedEvents.map((eventsChunk) =>
          filledV3RelayRepository.insert(eventsChunk),
        ),
      );
      this.logger.info(
        `Saved ${filledV3RelayEvents.length} FilledV3Relay events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving FilledV3Relay events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveRequestedV3SlowFillEvents(
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[],
    throwError = false,
  ) {
    const requestedV3SlowFillRepository =
      this.postgres.getRepository(RequestedV3SlowFill);
    const formattedEvents = requestedV3SlowFillEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
      };
    });
    try {
      await requestedV3SlowFillRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${requestedV3SlowFillEvents.length} RequestedV3SlowFill events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving RequestedV3SlowFill events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveRelayedRootBundleEvents(
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[],
    chainId: number,
    throwError = false,
  ) {
    const formattedEvents = relayedRootBundleEvents.map((event) => {
      return { ...event, chainId };
    });
    const relayedRootBundleRepository =
      this.postgres.getRepository(RelayedRootBundle);
    try {
      await relayedRootBundleRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${relayedRootBundleEvents.length} RelayedRootBundle events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving RelayedRootBundle events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveExecutedRelayerRefundRootEvents(
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[],
    throwError = false,
  ) {
    const executedRelayerRefundRootRepository = this.postgres.getRepository(
      ExecutedRelayerRefundRoot,
    );
    const formattedEvents = executedRelayerRefundRootEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
      };
    });
    try {
      await executedRelayerRefundRootRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${executedRelayerRefundRootEvents.length} ExecutedRelayerRefundRoot events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving ExecutedRelayerRefundRoot events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveTokensBridgedEvents(
    tokensBridgedEvents: across.interfaces.TokensBridged[],
    throwError = false,
  ) {
    const tokensBridgedRepository = this.postgres.getRepository(TokensBridged);
    const formattedEvents = tokensBridgedEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
      };
    });
    try {
      await tokensBridgedRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${tokensBridgedEvents.length} TokensBridged events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving TokensBridged events:",
        error,
      );
      if (throwError) throw error;
    }
  }
}
