import { getDeployedBlockNumber } from "@across-protocol/contracts";
import winston from "winston";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { DataSource } from "@repo/indexer-database";
import { HubPoolRepository } from "../database/HubPoolRepository";
import { differenceWith, isEqual } from "lodash";

import { RangeQueryStore, Ranges } from "../redis/rangeQueryStore";
import { RedisCache } from "../redis/redisCache";

import * as utils from "../utils";

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
export async function HubPoolIndexer(config: Config) {
  const {
    logger,
    redis,
    postgres,
    retryProviderConfig,
    redisKeyPrefix,
    hubConfig,
  } = config;

  let stopRequested = false;

  function makeId(...args: Array<string | number>) {
    return [redisKeyPrefix, ...args].join(":");
  }

  const resolvedRangeStore = new RangeQueryStore({
    redis,
    prefix: makeId("rangeQuery", "resolved"),
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
  const configStoreClient = await utils.getConfigStoreClient({
    logger,
    provider: configStoreProvider,
    maxBlockLookBack: hubConfig.maxBlockLookBack,
    chainId: hubConfig.chainId,
  });
  const hubPoolClient = await utils.getHubPoolClient({
    configStoreClient,
    provider: hubPoolProvider,
    logger,
    maxBlockLookBack: hubConfig.maxBlockLookBack,
    chainId: hubConfig.chainId,
  });

  const hubPoolRepository = new HubPoolRepository(postgres, logger, true);

  async function update() {
    const allPendingQueries = await getUnprocessedRanges();
    logger.info({
      message: `Running hubpool indexer on ${allPendingQueries.length} block range requests`,
      at: "HubpoolIndexer",
      config: hubConfig,
    });
    for (const query of allPendingQueries) {
      if (stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        logger.info({
          message: `Starting hubpool update for block range ${fromBlock} to ${toBlock}`,
          at: "HubpoolIndexer",
          config: hubConfig,
          query,
        });
        const events = await fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await storeEvents(events);

        await resolvedRangeStore.setByRange(fromBlock, toBlock);
        logger.info({
          message: `Completed hubpool update for block range ${fromBlock} to ${toBlock}`,
          at: "HubpoolIndexer",
          config: hubConfig,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          logger.error({
            message: `Error hubpool updating for block range ${fromBlock} to ${toBlock}`,
            at: "HubpoolIndexer",
            config: hubConfig,
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
  async function getUnprocessedRanges(toBlock?: number): Promise<Ranges> {
    const deployedBlockNumber = getDeployedBlockNumber(
      "HubPool",
      hubConfig.chainId,
    );
    const latestBlockNumber =
      toBlock ?? (await hubPoolProvider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: latestBlockNumber,
      maxBlockLookBack: hubConfig.maxBlockLookBack,
    });

    const allQueries = await resolvedRangeStore.entries();
    const resolvedRanges = allQueries.map(([, x]) => [x.fromBlock, x.toBlock]);
    const needsProcessing = differenceWith(
      allPaginatedBlockRanges,
      resolvedRanges,
      isEqual,
    );

    logger.info({
      message: `${needsProcessing.length} block ranges need processing`,
      deployedBlockNumber,
      latestBlockNumber,
      at: "HubpoolIndexer",
      config: hubConfig,
    });

    return needsProcessing;
  }

  async function fetchEventsByRange(fromBlock: number, toBlock: number) {
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
      proposedRootBundleEvents: proposedRootBundleEvents.map((p) => ({
        ...p,
        chainIds: configStoreClient.getChainIdIndicesForBlock(p.blockNumber),
      })),
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents: rootBundleExecutedEvents.filter(
        (event) =>
          event.blockNumber >= fromBlock && event.blockNumber <= toBlock,
      ),
    };
  }
  async function storeEvents(params: {
    proposedRootBundleEvents: (across.interfaces.ProposedRootBundle & {
      chainIds: number[];
    })[];
    rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[];
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[];
    rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[];
  }) {
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

  function stop() {
    stopRequested = true;
  }

  async function start(delay: number) {
    stopRequested = false;
    do {
      await update();
      await across.utils.delay(delay);
    } while (!stopRequested);
  }
  return {
    update,
    start,
    stop,
  };
}
export type HubPoolIndexer = Awaited<ReturnType<typeof HubPoolIndexer>>;
