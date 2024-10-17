import { CHAIN_IDs } from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import winston from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { BaseIndexer } from "../generics";
import {
  BlockRangeInsertType,
  BundleRepository,
} from "../database/BundleRepository";
import * as utils from "../utils";
import { getBlockTime } from "../web3/constants";
import {
  buildPoolRebalanceRoot,
  getBlockRangeBetweenBundles,
  getBundleBlockRanges,
} from "../utils/bundleBuilderUtils";

const BUNDLE_LIVENESS_SECONDS = 4 * 60 * 60; // 4 hour
const AVERAGE_SECONDS_PER_BLOCK = 13; // 13 seconds per block on ETH
const BLOCKS_PER_BUNDLE = Math.floor(
  BUNDLE_LIVENESS_SECONDS / AVERAGE_SECONDS_PER_BLOCK,
);

export type BundleConfig = {
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource;
  hubPoolClientFactory: utils.HubPoolClientFactory;
  spokePoolClientFactory: utils.SpokePoolClientFactory;
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
    const { logger, hubPoolClientFactory, spokePoolClientFactory } =
      this.config;
    const { bundleRepository } = this;
    await assignBundleToProposedEvent(bundleRepository, logger);
    await assignDisputeEventToBundle(bundleRepository, logger);
    await assignCanceledEventToBundle(bundleRepository, logger);
    await assignBundleRangesToProposal(bundleRepository, logger);
    await assignExecutionsToBundle(bundleRepository, logger);
    await assignBundleExecutedStatus(bundleRepository, logger);
    await assignSpokePoolEventsToExecutedBundles(
      bundleRepository,
      hubPoolClientFactory,
      spokePoolClientFactory,
      logger,
    );
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
          await dbRepository.retrieveClosestProposedRootBundleEvent(
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
          await dbRepository.retrieveClosestProposedRootBundleEvent(
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
          await dbRepository.retrieveClosestProposedRootBundleEvent(
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
          bundleId: proposedBundle.bundle.id,
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
        await dbRepository.retrieveClosestProposedRootBundleEvent(
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
  const insertResults = await dbRepository.associateBlockRangeWithBundle(
    rangeSegments
      .filter(
        (segment): segment is BlockRangeInsertType[] => segment !== undefined,
      )
      .flat(),
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
async function assignBundleExecutedStatus(
  dbRepository: BundleRepository,
  logger: winston.Logger,
): Promise<void> {
  const updateCount = await dbRepository.updateBundleExecutedStatus();
  if (updateCount) {
    logger.info({
      at: "Bundles#assignBundleExecutedStatus",
      message: "Updated bundles with executed status",
      bundlesUpdatedWithExecutedStatus: updateCount,
    });
  }
}

/**
 * Assigns spoke pool events to executed bundles by reconstructing the bundle data using the BundleDataClient.
 * @param bundleRepo Repository to interact with the Bundle entity.
 * @param hubClientFactory Factory to get HubPool clients.
 * @param spokeClientFactory Factory to get SpokePool clients.
 * @param logger A logger instance.
 * @returns A void promise when all executed bundles have been processed.
 */
async function assignSpokePoolEventsToExecutedBundles(
  bundleRepo: BundleRepository,
  hubClientFactory: utils.HubPoolClientFactory,
  spokeClientFactory: utils.SpokePoolClientFactory,
  logger: winston.Logger,
): Promise<void> {
  const executedBundles =
    await bundleRepo.getExecutedBundlesWithoutEventsAssociated({
      fromBlock: utils.ACROSS_V3_MAINNET_DEPLOYMENT_BLOCK,
    });

  if (executedBundles.length > 0) {
    // Get and update HubPool and ConfigStore clients
    const hubPoolClient = hubClientFactory.get(CHAIN_IDs.MAINNET);
    const configStoreClient = hubPoolClient.configStoreClient;
    await configStoreClient.update();
    await hubPoolClient.update();
    const clients = {
      hubPoolClient,
      configStoreClient,
      arweaveClient: null as unknown as across.caching.ArweaveClient, // FIXME: This is a hack to avoid instantiating the Arweave client
    };

    for (const executedBundle of executedBundles) {
      // Get bundle ranges as an array of [startBlock, endBlock] for each chain
      const ranges = getBundleBlockRanges(executedBundle);

      // Grab historical ranges from the last 8 bundles
      // FIXME: This is a hardcoded value, we should make this configurable
      const historicalBundle = await bundleRepo.retrieveMostRecentBundle(
        entities.BundleStatus.Executed,
        undefined,
        8,
      );
      // Check if we have enough historical data to build the bundle with
      // an ample lookback range. Otherwise skip current bundle
      if (!historicalBundle) {
        logger.warn({
          at: "BundleProcessor#assignSpokePoolEventsToExecutedBundles",
          message: `No historical bundle found. Skipping bundle reconstruction of bundle ${executedBundle.id}`,
        });
        continue;
      }
      // Resolve lookback range for the spoke clients
      const lookbackRange = getBlockRangeBetweenBundles(
        historicalBundle.proposal,
        executedBundle.proposal,
      );

      // Get spoke pool clients
      const spokeClients = lookbackRange.reduce(
        (acc, { chainId, startBlock, endBlock }) => {
          // We need to instantiate spoke clients using a higher end block than
          // the bundle range as deposits which fills are included in this bundle could
          // have occured outside the bundle range of the origin chain
          // NOTE: A buffer time of 15 minutes has been proved to work for older bundles
          const blockTime = getBlockTime(chainId);
          const endBlockTimeBuffer = 60 * 15;
          const blockBuffer = Math.round(endBlockTimeBuffer / blockTime);
          return {
            ...acc,
            [chainId]: spokeClientFactory.get(
              chainId,
              startBlock,
              endBlock + blockBuffer,
              {
                hubPoolClient,
              },
            ),
          };
        },
        {} as Record<number, across.clients.SpokePoolClient>,
      );

      // Update spoke clients
      await Promise.all(
        Object.values(spokeClients).map((client) => client.update()),
      );

      // Instantiate bundle data client and reconstruct bundle
      const bundleDataClient =
        new across.clients.BundleDataClient.BundleDataClient(
          logger,
          clients,
          spokeClients,
          executedBundle.proposal.chainIds,
        );
      const bundleData = await bundleDataClient.loadData(ranges, spokeClients);

      // Build pool rebalance root and check it matches with the root of the stored bundle
      const poolRebalanceRoot = buildPoolRebalanceRoot(
        ranges,
        bundleData,
        hubPoolClient,
        configStoreClient,
      );
      if (
        executedBundle.poolRebalanceRoot === poolRebalanceRoot.tree.getHexRoot()
      ) {
        // Store bundle events
        const storedEvents = await bundleRepo.storeBundleEvents(
          bundleData,
          executedBundle.id,
        );
        // Set bundle 'eventsAssociated' flag to true
        await bundleRepo.updateBundleEventsAssociatedFlag(executedBundle.id);
        logger.info({
          at: "BundleProcessor#assignSpokePoolEventsToExecutedBundles",
          message: "Events associated with bundle",
          storedEvents,
        });
      } else {
        logger.warn({
          at: "BundleProcessor#assignSpokePoolEventsToExecutedBundles",
          message: `Mismatching roots. Skipping bundle ${executedBundle.id}.`,
        });
        continue;
      }
    }
  }
}
