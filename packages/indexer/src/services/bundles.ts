import { DataSource, entities } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";
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
  private postgres: DataSource;
  constructor(private readonly config: BundleConfig) {
    super(config.logger, "bundle");
  }

  protected async indexerLogic(): Promise<void> {
    const { logger } = this.config;
    const { postgres } = this;
    await assignBundleToProposedEvent(postgres, logger);
    await assignDisputeEventToBundle(postgres, logger);
    await assignCanceledEventToBundle(postgres, logger);
  }

  protected async initialize(): Promise<void> {
    if (!this.config.postgres) {
      this.logger.error({
        at: "Bundles#Processor",
        message: "Postgres connection not provided",
      });
      throw new ConfigurationMalformedError();
    }
    this.postgres = this.config.postgres;
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
 * Retrieves the closest proposed root bundle to the given block number, transaction index, and log index. The
 * proposed root bundle can be no further back than the given max lookback from the provided block number.
 * @param blockNumber The block number to search from
 * @param transactionIndex The transaction index in the block to search from
 * @param logIndex The log index in the transaction to search from
 * @param maxLookbackFromBlock The maximum number of blocks to look back from the provided block number
 * @param dataSource The data source to query from
 * @returns The closest proposed root bundle back in time, or undefined if none are found
 */
function retrieveClosestProposedRootBundle(
  blockNumber: number,
  transactionIndex: number,
  logIndex: number,
  maxLookbackFromBlock: number,
  dataSource: DataSource,
): Promise<entities.ProposedRootBundle | null> {
  const proposedRootBundleRepository = dataSource.getRepository(
    entities.ProposedRootBundle,
  );
  return proposedRootBundleRepository
    .createQueryBuilder("prb")
    .select(["prb.id"])
    .where(
      // Proposal is in the past
      "(prb.blockNumber < :blockNumber OR " +
        // Proposal happened earlier in the block
        "(prb.blockNumber = :blockNumber AND prb.transactionIndex < :transactionIndex) OR " +
        // Proposal happened earlier in the same transaction
        "(prb.blockNumber = :blockNumber AND prb.transactionIndex = :transactionIndex AND prb.logIndex < :logIndex)) AND " +
        // Ensure the block difference is less than an average bundle length in ETH blocks
        "prb.blockNumber > :blockDiff",
      {
        blockNumber,
        transactionIndex,
        logIndex,
        blockDiff: blockNumber - maxLookbackFromBlock,
      },
    )
    .orderBy("prb.blockNumber", "DESC") // Grab the most recent proposal
    .getOne();
}

/**
 * Assigns disputed events to bundle entities if they haven't been associated yet.
 * @param dataSource A valid connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function assignDisputeEventToBundle(
  dataSource: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const bundleRepository = dataSource.getRepository(entities.Bundle);
  const disputedRootBundleRepository = dataSource.getRepository(
    entities.RootBundleDisputed,
  );

  // Find all disputed events that haven't been associated with a bundle.
  const disputedEventsWithoutBundleAssociated =
    await disputedRootBundleRepository
      .createQueryBuilder("drb")
      .select(["drb.id", "drb.blockNumber", "drb.logIndex"])
      .leftJoin("bundle", "b", "b.disputeId = drb.id")
      .where("b.disputeId IS NULL")
      .getMany();

  const updatedEvents = await Promise.all(
    disputedEventsWithoutBundleAssociated.map(
      async ({ blockNumber, id, logIndex, transactionIndex }) => {
        const proposedBundle = await retrieveClosestProposedRootBundle(
          blockNumber,
          transactionIndex,
          logIndex,
          AVERAGE_BLOCKS_PER_BUNDLE,
          dataSource,
        );
        if (!proposedBundle) {
          return undefined;
        }
        return bundleRepository.update(
          {
            proposal: { id: proposedBundle.id },
          },
          {
            dispute: { id },
            status: entities.BundleStatus.Disputed,
          },
        );
      },
    ),
  );
  const numberUpdated = updatedEvents.filter((x) => x).length;

  logResultOfAssignment(
    logger,
    "RootBundleDisputed",
    disputedEventsWithoutBundleAssociated.length,
    numberUpdated,
  );
}

/**
 * Assigns canceled events to bundle entities if they haven't been associated yet.
 * @param dataSource A valid connection to the database
 * @param logger A logger instance
 */
async function assignCanceledEventToBundle(
  dataSource: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const bundleRepository = dataSource.getRepository(entities.Bundle);
  const canceledRootBundleRepository = dataSource.getRepository(
    entities.RootBundleCanceled,
  );
  // Find all canceled events that haven't been associated with a bundle.
  const canceledEventsWithoutBundleAssociated =
    await canceledRootBundleRepository
      .createQueryBuilder("drb")
      .select(["drb.id", "drb.blockNumber", "drb.logIndex"])
      .leftJoin("bundle", "b", "b.cancelationId = drb.id")
      .where("b.cancelationId IS NULL")
      .getMany();

  const updatedEvents = await Promise.all(
    canceledEventsWithoutBundleAssociated.map(
      async ({ blockNumber, id, logIndex, transactionIndex }) => {
        const proposedBundle = await retrieveClosestProposedRootBundle(
          blockNumber,
          transactionIndex,
          logIndex,
          AVERAGE_BLOCKS_PER_BUNDLE,
          dataSource,
        );
        if (!proposedBundle) {
          return undefined;
        }
        return bundleRepository.update(
          {
            proposal: { id: proposedBundle.id },
          },
          {
            cancelation: { id },
            status: entities.BundleStatus.Canceled,
          },
        );
      },
    ),
  );
  const numberUpdated = updatedEvents.filter((x) => x).length;

  logResultOfAssignment(
    logger,
    "RootBundleCanceled",
    canceledEventsWithoutBundleAssociated.length,
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
  dataSource: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const proposedRootBundleRepository = dataSource.getRepository(
    entities.ProposedRootBundle,
  );
  const bundleRepository = dataSource.getRepository(entities.Bundle);

  // Grab all relevant proposed root bundle events that haven't been associated yet with a bundle.
  // This query uses a LEFT JOIN to find `ProposedRootBundle` records (`prb`) where no `Bundle`
  // is associated via the `proposal` foreign key (indicated by checking for NULL values in the `Bundle` table).
  const proposedEventsWithoutBundleAssociated =
    await proposedRootBundleRepository
      .createQueryBuilder("prb")
      .select([
        "prb.id",
        "prb.poolRebalanceRoot",
        "prb.relayerRefundRoot",
        "prb.slowRelayRoot",
      ])
      .leftJoin("bundle", "b", "b.proposalId = prb.id")
      .where("b.proposalId IS NULL")
      .getMany();

  // Perform a bulk insert of the new bundles.
  const resultingInsert = await bundleRepository.insert(
    proposedEventsWithoutBundleAssociated.map((event) =>
      bundleRepository.create({
        poolRebalanceRoot: event.poolRebalanceRoot,
        relayerRefundRoot: event.relayerRefundRoot,
        slowRelayRoot: event.slowRelayRoot,
        proposal: event,
        status: entities.BundleStatus.Proposed, // Default to proposed status
      }),
    ),
  );

  // Log the results of the operation.
  logResultOfAssignment(
    logger,
    "ProposedRootBundle",
    proposedEventsWithoutBundleAssociated.length,
    resultingInsert.identifiers.length,
  );
}
