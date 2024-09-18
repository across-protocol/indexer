import { DataSource, entities } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";
import { BundleRepository } from "../database/BundleRepository";
import { BaseIndexer } from "../generics";

const AVERAGE_BUNDLE_LIVENESS_SECONDS = 60 * 60; // 1 hour
const AVERAGE_SECONDS_PER_BLOCK = 13; // 13 seconds per block on ETH
const AVERAGE_BLOCKS_PER_BUNDLE = Math.floor(
  AVERAGE_BUNDLE_LIVENESS_SECONDS / AVERAGE_SECONDS_PER_BLOCK,
);

type BundleConfig = {
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
      message: "Found and associated proposed events with bundles",
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
            AVERAGE_BLOCKS_PER_BUNDLE,
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
            AVERAGE_BLOCKS_PER_BUNDLE,
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
