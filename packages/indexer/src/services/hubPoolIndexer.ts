import { DataSource } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";
import { BaseIndexer } from "../generics";
import * as utils from "../utils";
import { RangeQueryStore, Ranges } from "../redis/rangeQueryStore";
import { RedisCache } from "../redis/redisCache";
import * as across from "@across-protocol/sdk";
import { HubPoolRepository } from "../database/HubPoolRepository";
import { getDeployedBlockNumber } from "@across-protocol/contracts";
import { differenceWith, isEqual } from "lodash";

type Config = {
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  retryProviderConfig: utils.RetryProviderConfig;
  hubConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  redisKeyPrefix: string;
};

/**
 * Indexer for the hubpool contract and its component events
 */
export class Indexer extends BaseIndexer {
  private resolvedRangeStore: RangeQueryStore;
  private hubPoolRepository: HubPoolRepository;
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  constructor(private readonly config: Config) {
    super(config.logger, "hubPool");
  }
  protected async initialize(): Promise<void> {
    const {
      logger,
      redis,
      retryProviderConfig,
      hubConfig,
      redisKeyPrefix,
      postgres,
    } = this.config;
    this.resolvedRangeStore = new RangeQueryStore({
      redis,
      prefix: `${redisKeyPrefix}:rangeQuery:resolved`,
    });
    const redisCache = new RedisCache(redis);
    const hubPoolProvider = utils.getRetryProvider({
      ...retryProviderConfig,
      cache: redisCache,
      logger,
      ...hubConfig,
    });
    const configStoreProvider = utils.getRetryProvider({
      ...retryProviderConfig,
      cache: redisCache,
      logger,
      ...hubConfig,
    });
    this.configStoreClient = await utils.getConfigStoreClient({
      logger,
      provider: configStoreProvider,
      maxBlockLookBack: hubConfig.maxBlockLookBack,
      chainId: hubConfig.chainId,
    });
    this.hubPoolClient = await utils.getHubPoolClient({
      configStoreClient: this.configStoreClient,
      provider: hubPoolProvider,
      logger,
      maxBlockLookBack: hubConfig.maxBlockLookBack,
      chainId: hubConfig.chainId,
    });
    this.hubPoolRepository = new HubPoolRepository(postgres, logger, true);
  }

  protected async indexerLogic(): Promise<void> {
    const allPendingQueries = await this.getUnprocessedRanges();
    this.logger.info({
      message: `Running hubpool indexer on ${allPendingQueries.length} block range requests`,
      at: "HubpoolIndexer",
      config: this.config.hubConfig,
    });
    for (const query of allPendingQueries) {
      if (this.stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        this.logger.info({
          message: `Starting hubpool update for block range ${fromBlock} to ${toBlock}`,
          at: "HubpoolIndexer",
          config: this.config.hubConfig,
          query,
        });
        const events = await this.fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await this.storeEvents(events);

        await this.resolvedRangeStore.setByRange(fromBlock, toBlock);
        this.logger.info({
          message: `Completed hubpool update for block range ${fromBlock} to ${toBlock}`,
          at: "HubpoolIndexer",
          config: this.config.hubConfig,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error({
            message: `Error hubpool updating for block range ${fromBlock} to ${toBlock}`,
            at: "HubpoolIndexer",
            config: this.config.hubConfig,
            query,
            errorMessage: error.message,
          });
        } else {
          // not an error type, throw it and crash app likely
          throw error;
        }
      }
    }
  }
  async getUnprocessedRanges(toBlock?: number): Promise<Ranges> {
    const deployedBlockNumber = getDeployedBlockNumber(
      "HubPool",
      this.config.hubConfig.chainId,
    );
    const latestBlockNumber =
      toBlock ?? (await this.hubPoolClient.hubPool.provider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: latestBlockNumber,
      maxBlockLookBack: this.config.hubConfig.maxBlockLookBack,
    });

    const allQueries = await this.resolvedRangeStore.entries();
    const resolvedRanges = allQueries.map(([, x]) => [x.fromBlock, x.toBlock]);
    const needsProcessing = differenceWith(
      allPaginatedBlockRanges,
      resolvedRanges,
      isEqual,
    );

    this.logger.info({
      message: `${needsProcessing.length} block ranges need processing`,
      deployedBlockNumber,
      latestBlockNumber,
      at: "HubpoolIndexer",
      config: this.config.hubConfig,
    });

    return needsProcessing;
  }

  async fetchEventsByRange(fromBlock: number, toBlock: number) {
    const { hubPoolClient, configStoreClient } = this;

    await configStoreClient.update();
    await hubPoolClient.update();
    const proposedRootBundleEvents =
      hubPoolClient.getProposedRootBundlesInBlockRange(fromBlock, toBlock);
    const rootBundleCanceledEvents =
      hubPoolClient.getCancelledRootBundlesInBlockRange(fromBlock, toBlock);
    const rootBundleDisputedEvents =
      hubPoolClient.getDisputedRootBundlesInBlockRange(fromBlock, toBlock);
    // we do not have a block range query for executed root bundles
    const rootBundleExecutedEvents = hubPoolClient.getExecutedRootBundles();

    return {
      // we need to make sure we filter out all unecessary events for the block range requested
      proposedRootBundleEvents,
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents: rootBundleExecutedEvents.filter(
        (event) =>
          event.blockNumber >= fromBlock && event.blockNumber <= toBlock,
      ),
    };
  }
  private async storeEvents(params: {
    proposedRootBundleEvents: across.interfaces.ProposedRootBundle[];
    rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[];
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[];
    rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[];
  }) {
    const { hubPoolRepository } = this;
    const {
      proposedRootBundleEvents,
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents,
    } = params;
    await hubPoolRepository.formatAndSaveProposedRootBundleEvents(
      proposedRootBundleEvents,
    );
    await hubPoolRepository.formatAndSaveRootBundleCanceledEvents(
      rootBundleCanceledEvents,
    );
    await hubPoolRepository.formatAndSaveRootBundleDisputedEvents(
      rootBundleDisputedEvents,
    );
    await hubPoolRepository.formatAndSaveRootBundleExecutedEvents(
      rootBundleExecutedEvents,
    );
  }
}
