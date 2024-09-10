import { DataSource, entities } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";

const AVERAGE_BUNDLE_LIVENESS_SECONDS = 60 * 60; // 1 hour
const AVERAGE_SECONDS_PER_BLOCK = 13; // 13 seconds per block on ETH
const AVERAGE_BLOCKS_PER_BUNDLE = Math.floor(
  AVERAGE_BUNDLE_LIVENESS_SECONDS / AVERAGE_SECONDS_PER_BLOCK,
);

/**
 * Error thrown when the indexer configuration is malformed
 */
class IndexerConfigurationMalformedError extends Error {
  constructor() {
    super("Indexer configuration is malformed");
    this.name = "IndexerConfigurationMalformedError";
  }
}

type BundleConfig = {
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource | undefined;
};

/**
 * Closure generator for the indexer service to track bundle meta-data
 * @param config The configuration for the indexer service
 * @returns A function that can be called to start the indexer service
 */
export function Indexer(config: BundleConfig) {
  const { postgres, logger } = config;

  if (!postgres) {
    logger.error({
      at: "Bundles#Indexer",
      message: "Postgres connection not provided",
    });
    throw new IndexerConfigurationMalformedError();
  }

  return async () => {
    await Promise.all([
      assignBundleToProposedEvent(postgres, logger),
      asignDisputeEventToBundle(postgres, logger),
      asignCanceledEventToBundle(postgres, logger),
    ]);
  };
}

function logResultOfAssignment(
  logger: winston.Logger,
  eventType: string,
  unassociatedRecordsCount: number,
  persistedRecordsCount: number,
): void {
  logger.info({
    at: `Bundles#assignToBundle`,
    message: "Found and associated proposed events with bundles",
    unassociatedRecordsCount,
    persistedRecordsCount,
    eventType,
  });
}

function retrieveClosestProposedRootBundle(
  blockNumber: number,
  transactionIndex: number,
  logIndex: number,
  maxLookbackFromBlock: number,
  dataSource: DataSource,
) {
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

async function asignDisputeEventToBundle(
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

async function asignCanceledEventToBundle(
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
      .leftJoin("bundle", "b", "b.cancellationId = drb.id")
      .where("b.cancellationId IS NULL")
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
