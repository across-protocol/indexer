import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils } from "@repo/indexer-database";

export class HubPoolRepository extends utils.BaseRepository {
  constructor(postgres: DataSource, logger: winston.Logger) {
    super(postgres, logger);
  }

  public async formatAndSaveProposedRootBundleEvents(
    proposedRootBundleEvents: across.interfaces.ProposedRootBundle[],
    throwError = false,
  ) {
    const formattedEvents = proposedRootBundleEvents.map((event) => {
      return {
        ...event,
        challengePeriodEndTimestamp: new Date(
          event.challengePeriodEndTimestamp * 1000,
        ),
        bundleEvaluationBlockNumbers: event.bundleEvaluationBlockNumbers.map(
          (blockNumber) => parseInt(blockNumber.toString()),
        ),
      };
    });
    await this.insert(entities.ProposedRootBundle, formattedEvents, throwError);
  }

  public async formatAndSaveRootBundleDisputedEvents(
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[],
    throwError = false,
  ) {
    const formattedEvents = rootBundleDisputedEvents.map((event) => {
      return {
        ...event,
        requestTime: new Date(event.requestTime * 1000),
      };
    });
    await this.insert(entities.RootBundleDisputed, formattedEvents, throwError);
  }

  public async formatAndSaveRootBundleCanceledEvents(
    rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[],
    throwError = false,
  ) {
    const formattedEvents = rootBundleCanceledEvents.map((event) => {
      return {
        ...event,
        caller: event.disputer,
        requestTime: new Date(event.requestTime * 1000),
      };
    });
    await this.insert(entities.RootBundleCanceled, formattedEvents, throwError);
  }

  public async formatAndSaveRootBundleExecutedEvents(
    rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[],
    throwError = false,
  ) {
    const formattedEvents = rootBundleExecutedEvents.map((event) => {
      return {
        ...event,
        bundleLpFees: event.bundleLpFees.map((fees) => fees.toString()),
        netSendAmounts: event.netSendAmounts.map((amount) => amount.toString()),
        runningBalances: event.runningBalances.map((balance) =>
          balance.toString(),
        ),
      };
    });
    await this.insert(entities.RootBundleExecuted, formattedEvents, throwError);
  }
}
