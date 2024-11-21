import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import winston from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { BaseIndexer } from "../generics";
import { BundleRepository } from "../database/BundleRepository";
import * as utils from "../utils";
import { getBlockTime } from "../web3/constants";
import {
  buildPoolRebalanceRoot,
  getBlockRangeBetweenBundles,
  getBundleBlockRanges,
} from "../utils/bundleBuilderUtils";

export type BundleConfig = {
  hubChainId: number;
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  hubPoolClientFactory: utils.HubPoolClientFactory;
  spokePoolClientFactory: utils.SpokePoolClientFactory;
  bundleRepository: BundleRepository;
};

export class BundleIncludedEventsService extends BaseIndexer {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;

  constructor(private readonly config: BundleConfig) {
    super(config.logger, "BundleIncludedEventsService");
  }

  protected async indexerLogic(): Promise<void> {
    try {
      this.config.logger.info({
        at: "BundleIncludedEventsService#indexerLogic",
        message: "Starting BundleIncludedEventsService",
      });
      await this.assignSpokePoolEventsToExecutedBundles();

      this.config.logger.info({
        at: "BundleIncludedEventsService#indexerLogic",
        message: "Finished BundleIncludedEventsService",
      });
    } catch (error) {
      this.logger.error({
        at: "BundleIncludedEventsService#indexerLogic",
        message: "Error in BundleIncludedEventsService",
        error,
      });
    }
  }

  protected async initialize(): Promise<void> {
    const { hubPoolClientFactory } = this.config;
    this.hubPoolClient = hubPoolClientFactory.get(this.config.hubChainId);
    this.configStoreClient = this.hubPoolClient.configStoreClient;
  }

  private async assignSpokePoolEventsToExecutedBundles(): Promise<void> {
    const { logger, bundleRepository } = this.config;
    const executedBundles =
      await bundleRepository.getExecutedBundlesWithoutEventsAssociated({
        fromBlock: utils.ACROSS_V3_MAINNET_DEPLOYMENT_BLOCK,
      });
    logger.info({
      at: "ExecutedBundleEventsService#assignSpokePoolEventsToExecutedBundles",
      message: `Found ${executedBundles.length} executed bundles without events associated`,
    });
    if (executedBundles.length === 0) {
      return;
    }

    logger.debug({
      at: "BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
      message: "Updating HubPool and ConfigStore clients",
    });
    const startTime = Date.now();
    await this.configStoreClient.update();
    await this.hubPoolClient.update();
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.debug({
      at: "BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
      message: `Updated HubPool and ConfigStore clients in ${duration / 1000} seconds`,
    });

    for (const bundle of executedBundles) {
      await this.getEventsIncludedInBundle(bundle);
    }
  }

  private async getEventsIncludedInBundle(
    bundle: entities.Bundle,
  ): Promise<void> {
    const { logger, bundleRepository, spokePoolClientFactory } = this.config;
    const historicalBundle = await bundleRepository.retrieveMostRecentBundle(
      entities.BundleStatus.Executed,
      bundle.proposal.blockNumber,
      8,
    );
    // Skip the bundle if we don't have enough historical data
    if (!historicalBundle) {
      logger.warn({
        at: "BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `No historical bundle found. Skipping bundle reconstruction of bundle ${bundle.id}`,
      });
      return;
    }
    const lookbackRange = getBlockRangeBetweenBundles(
      historicalBundle.proposal,
      bundle.proposal,
    );
    const spokeClients = this.getSpokeClientsForLookbackBlockRange(
      lookbackRange,
      spokePoolClientFactory,
    );
    logger.debug({
      at: "BundleIncludedEventsService#getEventsIncludedInBundle",
      message: `Updating spoke clients for lookback range for bundle ${bundle.id}`,
      lookbackRange,
    });
    const startTime = Date.now();
    await Promise.all(
      Object.values(spokeClients).map((client) => client.update()),
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.debug({
      at: "BundleIncludedEventsService#getEventsIncludedInBundle",
      message: `Updated spoke clients in ${duration / 1000} seconds for bundle ${bundle.id}`,
    });
    const clients = {
      hubPoolClient: this.hubPoolClient,
      configStoreClient: this.configStoreClient,
      arweaveClient: null as unknown as across.caching.ArweaveClient, // FIXME: This is a hack to avoid instantiating the Arweave client
    };
    // Instantiate bundle data client and reconstruct bundle
    const bundleDataClient =
      new across.clients.BundleDataClient.BundleDataClient(
        logger,
        clients,
        spokeClients,
        bundle.proposal.chainIds,
      );
    // Get bundle ranges as an array of [startBlock, endBlock] for each chain
    const bundleBlockRanges = getBundleBlockRanges(bundle);
    const bundleData = await bundleDataClient.loadData(
      bundleBlockRanges,
      spokeClients,
    );

    // Build pool rebalance root and check it matches with the root of the stored bundle
    const poolRebalanceRoot = buildPoolRebalanceRoot(
      bundleBlockRanges,
      bundleData,
      this.hubPoolClient,
      this.configStoreClient,
    );
    if (bundle.poolRebalanceRoot !== poolRebalanceRoot.tree.getHexRoot()) {
      logger.warn({
        at: "BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Mismatching roots. Skipping bundle ${bundle.id}.`,
      });
      return;
    } else {
      const storedEvents = await bundleRepository.storeBundleEvents(
        bundleData,
        bundle.id,
      );
      await bundleRepository.updateBundleEventsAssociatedFlag(bundle.id);
      logger.info({
        at: "BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Stored bundle events for bundle ${bundle.id}`,
        storedEvents,
      });
    }
  }

  private getSpokeClientsForLookbackBlockRange(
    lookbackRange: utils.ProposalRangeResult[],
    spokePoolClientFactory: utils.SpokePoolClientFactory,
  ) {
    return lookbackRange.reduce(
      (acc, { chainId, startBlock, endBlock }) => {
        // We need to instantiate spoke clients using a higher end block than
        // the bundle range as deposits which fills are included in this bundle could
        // have occured outside the bundle range of the origin chain
        // NOTE: A buffer time of 15 minutes has been proven to work for older bundles
        const blockTime = getBlockTime(chainId);
        const endBlockTimeBuffer = 60 * 15;
        const blockBuffer = Math.round(endBlockTimeBuffer / blockTime);
        return {
          ...acc,
          [chainId]: spokePoolClientFactory.get(
            chainId,
            startBlock,
            endBlock + blockBuffer,
            {
              hubPoolClient: this.hubPoolClient,
            },
          ),
        };
      },
      {} as Record<number, across.clients.SpokePoolClient>,
    );
  }
}
