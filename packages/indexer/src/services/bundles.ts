import Redis from "ioredis";
import winston from "winston";
import {
  DataSource,
  SaveQueryResult,
  SaveQueryResultType,
  utils as dbUtils,
  entities,
} from "@repo/indexer-database";
import {
  BlockRangeInsertType,
  BundleRepository,
} from "../database/BundleRepository";
import * as across from "@across-protocol/sdk";

const BUNDLE_LIVENESS_SECONDS = 4 * 60 * 60; // 4 hour
const AVERAGE_SECONDS_PER_BLOCK = 13; // 13 seconds per block on ETH
const BLOCKS_PER_BUNDLE = Math.floor(
  BUNDLE_LIVENESS_SECONDS / AVERAGE_SECONDS_PER_BLOCK,
);

// Define the event types we'll be handling
enum BundleEvents {
  ProposedRootBundle = "ProposedRootBundle",
  DisputedRootBundle = "DisputedRootBundle",
  CanceledRootBundle = "CanceledRootBundle",
  ExecutedRootBundle = "ExecutedRootBundle",
  BundleBlockRange = "BundleBlockRange",
  BundleExecutedStatus = "BundleExecutedStatus",
}

// Define the structure for our stored events
export type StoreBundleEventsResult = {
  proposedEvents: entities.ProposedRootBundle[];
  disputedEvents: entities.RootBundleDisputed[];
  canceledEvents: entities.RootBundleCanceled[];
  executedEvents: entities.RootBundleExecuted[];
};

export type BundleConfig = {
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource;
  bundleRepository: BundleRepository;
};

export class BundleProcessor {
  constructor(
    private readonly logger: winston.Logger,
    private readonly bundleRepository: BundleRepository,
  ) {}

  public async process(events: StoreBundleEventsResult): Promise<void> {
    try {
      const timeToProcessStart = performance.now();

      // Process all bundle events in sequence
      await this.assignBundleToProposedEvent(events.proposedEvents);
      await this.assignDisputeEventToBundle(events.disputedEvents);
      await this.assignCanceledEventToBundle(events.canceledEvents);
      await this.assignExecutionsToBundle(events.executedEvents);

      // Process derived states
      await this.assignBundleRangesToProposal();
      await this.assignBundleExecutedStatus();

      const timeToProcessEnd = performance.now();

      this.logger.debug({
        at: "Indexer#BundleProcessor#process",
        message: "System Time Log for BundleProcessor#process",
        timeToProcess: timeToProcessEnd - timeToProcessStart,
        eventCounts: {
          proposedEvents: events.proposedEvents.length,
          disputedEvents: events.disputedEvents.length,
          canceledEvents: events.canceledEvents.length,
          executedEvents: events.executedEvents.length,
        },
      });
    } catch (error) {
      this.logger.error({
        at: "Indexer#BundleProcessor#process",
        message: "Error processing bundle events",
        error,
      });
      throw error;
    }
  }

  private async assignBundleToProposedEvent(
    proposedEvents: entities.ProposedRootBundle[],
  ): Promise<void> {
    const createdBundleCount =
      await this.bundleRepository.createBundlesForProposedEvents(
        proposedEvents,
      );

    this.logResultOfAssignment(
      BundleEvents.ProposedRootBundle,
      proposedEvents.length,
      createdBundleCount,
    );
  }

  private async assignDisputeEventToBundle(
    disputedEvents: entities.RootBundleDisputed[],
  ): Promise<void> {
    const eventAssociations = await Promise.all(
      disputedEvents.map(
        async ({ blockNumber, id, logIndex, transactionIndex }) => {
          const proposedBundle =
            await this.bundleRepository.retrieveClosestProposedRootBundleEvent(
              blockNumber,
              transactionIndex,
              logIndex,
              BLOCKS_PER_BUNDLE,
            );
          if (!proposedBundle) {
            return undefined;
          }
          return {
            bundleId: proposedBundle.bundle.id,
            eventId: id,
          };
        },
      ),
    );

    const updatedEventCount =
      await this.bundleRepository.associateEventsToBundle(
        eventAssociations,
        "disputed",
      );

    this.logResultOfAssignment(
      BundleEvents.DisputedRootBundle,
      disputedEvents.length,
      updatedEventCount,
    );
  }

  private async assignCanceledEventToBundle(
    canceledEvents: entities.RootBundleCanceled[],
  ): Promise<void> {
    const eventAssociations = await Promise.all(
      canceledEvents.map(
        async ({ blockNumber, id, logIndex, transactionIndex }) => {
          const proposedBundle =
            await this.bundleRepository.retrieveClosestProposedRootBundleEvent(
              blockNumber,
              transactionIndex,
              logIndex,
              BLOCKS_PER_BUNDLE,
            );
          if (!proposedBundle) {
            return undefined;
          }
          return {
            bundleId: proposedBundle.bundle.id,
            eventId: id,
          };
        },
      ),
    );

    const updatedEventCount =
      await this.bundleRepository.associateEventsToBundle(
        eventAssociations,
        "canceled",
      );

    this.logResultOfAssignment(
      BundleEvents.CanceledRootBundle,
      canceledEvents.length,
      updatedEventCount,
    );
  }

  private async assignExecutionsToBundle(
    executedEvents: entities.RootBundleExecuted[],
  ): Promise<void> {
    const eventAssociations = await Promise.all(
      executedEvents.map(
        async ({ blockNumber, id, logIndex, transactionIndex }) => {
          const proposedBundle =
            await this.bundleRepository.retrieveClosestProposedRootBundleEvent(
              blockNumber,
              transactionIndex,
              logIndex,
            );
          if (!proposedBundle) {
            this.logger.error({
              at: "Indexer#BundleProcessor#assignExecutionsToBundle",
              message:
                "Unable to find a proposed bundle for the given execution",
              executionId: id,
            });
            throw new Error(
              `Unable to find a proposed bundle for the given execution ${id}`,
            );
          }
          return {
            bundleId: proposedBundle.bundle.id,
            executionId: id,
          };
        },
      ),
    );

    const insertResults =
      await this.bundleRepository.associateRootBundleExecutedEventsToBundle(
        eventAssociations,
      );

    this.logResultOfAssignment(
      BundleEvents.ExecutedRootBundle,
      executedEvents.length,
      insertResults,
    );
  }

  private async assignBundleRangesToProposal(): Promise<void> {
    // We first want to confirm that there's no outstanding disputes or cancelations that
    // haven't been associated with a bundle. We need to ensure that all events are associated
    // before we can assign ranges to the proposal to account for the most accurate ranges.
    const [unassociatedDisputes, unassociatedCancellations] = await Promise.all(
      [
        this.bundleRepository.retrieveUnassociatedDisputedEvents(),
        this.bundleRepository.retrieveUnassociatedCanceledEvents(),
      ],
    );
    if (
      unassociatedDisputes.length > 0 ||
      unassociatedCancellations.length > 0
    ) {
      this.logger.debug({
        at: "Indexer#BundleProcessor#assignBundleRangesToProposal",
        message:
          "Unassociated disputes or cancellations found. Unable to assign ranges.",
        unassociatedDisputes: unassociatedDisputes.length,
        unassociatedCancellations: unassociatedCancellations.length,
      });
      return;
    }
    // Next, we want to find all bundles that don't have ranges defined yet.
    const bundlesWithoutRanges =
      await this.bundleRepository.retrieveBundlesWithoutBlockRangesDefined();
    // For each bundle without a range, find the previous undisputed/non-canceled event
    // so that we can resolve the start range for the bundle.
    const rangeSegments = await Promise.all(
      bundlesWithoutRanges.map(async (bundle) => {
        const previousEvent =
          await this.bundleRepository.retrieveClosestProposedRootBundleEvent(
            bundle.proposal.blockNumber,
            bundle.proposal.transactionIndex,
            bundle.proposal.logIndex,
          );
        if (!previousEvent) {
          return undefined;
        }
        return bundle.proposal.bundleEvaluationBlockNumbers.reduce(
          (acc, endBlock, idx) => {
            // We can enforce that this chainId is defined because the proposal
            // has parallel arrays.
            const chainId = bundle.proposal.chainIds[idx]!;
            // Per UMIP rules, this list of bundle evaluation block numbers is strictly
            // append-only. As a result, we can guarantee that the index of each chain
            // matches the previous. For the case that the current bundle adds a new chain
            // to the proposal, the corresponding previous event index should resolve undefined
            // and therefore the start block should be 0.
            const previousEndBlock =
              previousEvent.bundleEvaluationBlockNumbers[idx] ?? 0;
            return [
              ...acc,
              {
                bundleId: bundle.id,
                chainId,
                startBlock:
                  previousEndBlock !== endBlock
                    ? previousEndBlock + 1
                    : previousEndBlock, // Bundle range doesn't change for disabled chains
                endBlock,
              },
            ];
          },
          [] as BlockRangeInsertType[],
        );
      }),
    );
    const insertResults =
      await this.bundleRepository.associateBlockRangeWithBundle(
        rangeSegments
          .filter(
            (segment): segment is BlockRangeInsertType[] =>
              segment !== undefined,
          )
          .flat(),
      );
    this.logResultOfAssignment(
      BundleEvents.BundleBlockRange,
      rangeSegments.length,
      insertResults,
    );
  }

  private async assignBundleExecutedStatus(): Promise<void> {
    const updateCount =
      await this.bundleRepository.updateBundleExecutedStatus();
    if (updateCount) {
      this.logger.debug({
        at: "Indexer#BundleProcessor#assignBundleExecutedStatus",
        message: "Updated bundles with executed status",
        bundlesUpdatedWithExecutedStatus: updateCount,
      });
    }
  }

  private logResultOfAssignment(
    eventType: BundleEvents,
    unassociatedRecordsCount: number,
    persistedRecordsCount: number,
  ): void {
    if (persistedRecordsCount > 0) {
      this.logger.debug({
        at: `Indexer#BundleProcessor#assignToBundle`,
        message: "Found and associated events with bundles",
        unassociatedRecordsCount,
        persistedRecordsCount,
        eventType,
      });
    }
  }
}
