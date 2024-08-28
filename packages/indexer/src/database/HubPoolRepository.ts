import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities } from "@repo/indexer-database";

export class HubPoolRepository {
  constructor(
    private postgres: DataSource,
    private logger: winston.Logger,
  ) {}

  public async formatAndSaveProposedRootBundleEvents(
    proposedRootBundleEvents: across.interfaces.ProposedRootBundle[],
    throwError = false,
  ) {
    const proposedRootBundleRepository = this.postgres.getRepository(
      entities.ProposedRootBundle,
    );
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
    try {
      await proposedRootBundleRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${proposedRootBundleEvents.length} ProposedRootBundle events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving ProposedRootBundle events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveRootBundleDisputedEvents(
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[],
    throwError = false,
  ) {
    const rootBundleDisputedRepository = this.postgres.getRepository(
      entities.RootBundleDisputed,
    );
    const formattedEvents = rootBundleDisputedEvents.map((event) => {
      return {
        ...event,
        requestTime: new Date(event.requestTime * 1000),
      };
    });
    try {
      await rootBundleDisputedRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${rootBundleDisputedEvents.length} RootBundleDisputed events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving RootBundleDisputed events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveRootBundleCanceledEvents(
    rootBundleCanceledEvents: across.interfaces.DisputedRootBundle[],
    throwError = false,
  ) {
    const rootBundleCanceledRepository = this.postgres.getRepository(
      entities.RootBundleCanceled,
    );
    const formattedEvents = rootBundleCanceledEvents.map((event) => {
      return {
        ...event,
        caller: event.disputer,
        requestTime: new Date(event.requestTime * 1000),
      };
    });
    try {
      await rootBundleCanceledRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${rootBundleCanceledEvents.length} RootBundleCanceled events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving RootBundleCanceled events:",
        error,
      );
      if (throwError) throw error;
    }
  }

  public async formatAndSaveRootBundleExecutedEvents(
    rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[],
    throwError = false,
  ) {
    const rootBundleExecutedRepository = this.postgres.getRepository(
      entities.RootBundleExecuted,
    );
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
    try {
      await rootBundleExecutedRepository.insert(formattedEvents);
      this.logger.info(
        `Saved ${rootBundleExecutedEvents.length} RootBundleExecuted events`,
      );
    } catch (error) {
      this.logger.error(
        "There was an error while saving RootBundleExecuted events:",
        error,
      );
      if (throwError) throw error;
    }
  }
}
