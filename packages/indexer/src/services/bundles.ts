import { DataSource } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";
import { BaseIndexer } from "../generics";
import {
  BlockRangeInsertType,
  BundleRepository,
} from "../database/BundleRepository";

const BUNDLE_LIVENESS_SECONDS = 4 * 60 * 60; // 4 hour
const AVERAGE_SECONDS_PER_BLOCK = 13; // 13 seconds per block on ETH
const BLOCKS_PER_BUNDLE = Math.floor(
  BUNDLE_LIVENESS_SECONDS / AVERAGE_SECONDS_PER_BLOCK,
);

export type BundleConfig = {
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource | undefined;
};

/**
 * Error thrown when the processor configuration is malformed
 */
class ConfigurationMalformedError extends Error {
  constructor() {
    super("Processor configuration is malformed");
    this.name = "ProcessorConfigurationMalformedError";
  }
}

export class Processor extends BaseIndexer {
  private bundleRepository: BundleRepository;
  constructor(private readonly config: BundleConfig) {
    super(config.logger, "bundle");
  }

  protected async indexerLogic(): Promise<void> {
    const { logger } = this.config;
    const { bundleRepository } = this;
    await assignBundleToProposedEvent(bundleRepository, logger);
    await assignDisputeEventToBundle(bundleRepository, logger);
    await assignCanceledEventToBundle(bundleRepository, logger);
    await assignBundleRangesToProposal(bundleRepository, logger);
    await assignExecutionsToBundle(bundleRepository, logger);
    await assignBundleValidatedStatus(bundleRepository, logger);
  }

  protected async initialize(): Promise<void> {
    if (!this.config.postgres) {
      this.logger.error({
        at: "Bundles#Processor",
        message: "Postgres connection not provided",
      });
      throw new ConfigurationMalformedError();
    }
    this.bundleRepository = new BundleRepository(
      this.config.postgres,
      this.config.logger,
      true,
    );
  }
}

/**
 * A convenience function to log the results of the assignment operation.
 * @param logger The logger instance
 * @param eventType The type of event being associated
 * @param unassociatedRecordsCount The number of records that were unassociated
 * @param persistedRecordsCount The number of records that were associated
 * @returns A void promise
 */
function logResultOfAssignment(
  logger: winston.Logger,
  eventType: string,
  unassociatedRecordsCount: number,
  persistedRecordsCount: number,
): void {
  if (unassociatedRecordsCount > 0) {
    logger.info({
      at: `Bundles#assignToBundle`,
      message: "Found and associated events with bundles",
      unassociatedRecordsCount,
      persistedRecordsCount,
      eventType,
    });
  }
}

/**
 * Assigns disputed events to bundle entities if they haven't been associated yet.
 * @param dataSource A valid connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function assignDisputeEventToBundle(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const unassignedDisputedEvents =
    await dbRepository.retrieveUnassociatedDisputedEvents();
  const eventAssociations = await Promise.all(
    unassignedDisputedEvents.map(
      async ({ blockNumber, id, logIndex, transactionIndex }) => {
        const proposedBundle =
          await dbRepository.retrieveClosestProposedRootBundle(
            blockNumber,
            transactionIndex,
            logIndex,
            BLOCKS_PER_BUNDLE,
          );
        if (!proposedBundle) {
          return undefined;
        }
        return {
          bundleId: proposedBundle.id,
          eventId: id,
        };
      },
    ),
  );
  const updatedEventCount = await dbRepository.associateEventsToBundle(
    eventAssociations,
    "disputed",
  );
  logResultOfAssignment(
    logger,
    "RootBundleDisputed",
    unassignedDisputedEvents.length,
    updatedEventCount,
  );
}

/**
 * Assigns canceled events to bundle entities if they haven't been associated yet.
 * @param dataSource A valid connection to the database
 * @param logger A logger instance
 */
async function assignCanceledEventToBundle(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const unassignedCanceledEvents =
    await dbRepository.retrieveUnassociatedCanceledEvents();
  const eventAssociations = await Promise.all(
    unassignedCanceledEvents.map(
      async ({ blockNumber, id, logIndex, transactionIndex }) => {
        const proposedBundle =
          await dbRepository.retrieveClosestProposedRootBundle(
            blockNumber,
            transactionIndex,
            logIndex,
            BLOCKS_PER_BUNDLE,
          );
        if (!proposedBundle) {
          return undefined;
        }
        return {
          bundleId: proposedBundle.id,
          eventId: id,
        };
      },
    ),
  );
  const numberUpdated = await dbRepository.associateEventsToBundle(
    eventAssociations,
    "canceled",
  );
  logResultOfAssignment(
    logger,
    "RootBundleCanceled",
    unassignedCanceledEvents.length,
    numberUpdated,
  );
}

async function assignExecutionsToBundle(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const unassociatedExecutions =
    await dbRepository.retrieveUnassociatedRootBundleExecutedEvents();

  const mappingOfExecutionsToBundles = await Promise.all(
    unassociatedExecutions.map(
      async ({ blockNumber, id, logIndex, transactionIndex }) => {
        const proposedBundle =
          await dbRepository.retrieveClosestProposedRootBundle(
            blockNumber,
            transactionIndex,
            logIndex,
          );
        if (!proposedBundle) {
          logger.error({
            at: "Bundles#assignExecutionsToBundle",
            message: "Unable to find a proposed bundle for the given execution",
            executionId: id,
          });
          throw new Error(
            `Unable to find a proposed bundle for the given execution ${id}`,
          );
        }
        return {
          bundleId: proposedBundle.id,
          executionId: id,
        };
      },
    ),
  );

  const insertResults =
    await dbRepository.associateRootBundleExecutedEventsToBundle(
      mappingOfExecutionsToBundles,
    );

  logResultOfAssignment(
    logger,
    "RootBundleExecuted",
    unassociatedExecutions.length,
    insertResults.generatedMaps.length,
  );
}

async function assignBundleRangesToProposal(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  // We first want to confirm that there's no outstanding disputes or cancelations that
  // haven't been associated with a bundle. We need to ensure that all events are associated
  // before we can assign ranges to the proposal to account for the most accurate ranges.
  const [unassociatedDisputes, unassociatedCancellations] = await Promise.all([
    dbRepository.retrieveUnassociatedDisputedEvents(),
    dbRepository.retrieveUnassociatedCanceledEvents(),
  ]);
  if (unassociatedDisputes.length > 0 || unassociatedCancellations.length > 0) {
    logger.info({
      at: "Bundles#assignBundleRangesToProposal",
      message:
        "Unassociated disputes or cancellations found. Unable to assign ranges.",
      unassociatedDisputes: unassociatedDisputes.length,
      unassociatedCancellations: unassociatedCancellations.length,
    });
    return;
  }
  // Next, we want to find all bundles that don't have ranges defined yet.
  const bundlesWithoutRanges =
    await dbRepository.retrieveBundlesWithoutBlockRangesDefined();
  // For each bundle without a range, find the previous undisputed/non-canceled event
  // so that we can resolve the start range for the bundle.
  const rangeSegments = await Promise.all(
    bundlesWithoutRanges.map(async (bundle) => {
      const previousEvent =
        await dbRepository.retrieveClosestProposedRootBundle(
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
          const startBlock =
            previousEvent.bundleEvaluationBlockNumbers[idx] ?? 0;
          return [
            ...acc,
            {
              bundleId: bundle.id,
              chainId,
              startBlock,
              endBlock,
            },
          ];
        },
        [] as BlockRangeInsertType[],
      );
    }),
  );
  const insertResults = await dbRepository.associateBlockRangeWithBundle(
    rangeSegments.filter((segment) => segment !== undefined).flat(),
  );
  logResultOfAssignment(
    logger,
    "BundleBlockRange",
    rangeSegments.length,
    insertResults.generatedMaps.length,
  );
}

/**
 * Calls the database to find all proposed events that don't have a bundle
 * and creates a bundle for each one.
 * @param dataSource A connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function assignBundleToProposedEvent(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const unassignedProposedEvents =
    await dbRepository.retrieveUnassociatedProposedRootBundleEvents();
  const createdBundleCount = await dbRepository.createBundlesForProposedEvents(
    unassignedProposedEvents,
  );
  // Log the results of the operation.
  logResultOfAssignment(
    logger,
    "ProposedRootBundle",
    unassignedProposedEvents.length,
    createdBundleCount,
  );
}

/**
 * Assigns validated/executed status to bundles that have sufficient or all
 * root bundle executed
 * @param dbRepository A connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function assignBundleValidatedStatus(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const updates = await dbRepository.updateBundleStatus();
  if (updates.executedCount > 0 || updates.validatedCount > 0) {
    logger.info({
      at: "Bundles#assignBundleValidatedStatus",
      message: "Updated bundles with validated/executed status",
      bundlesUpdatedWithExecutedStatus: updates.executedCount,
      bundlesUpdatedWithValidatedStatus: updates.validatedCount,
    });
  }
}
