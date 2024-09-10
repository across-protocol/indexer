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
    });
    for (const query of allPendingQueries) {
      if (stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        logger.info({
          message: `Starting hubpool update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
        const events = await fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await storeEvents(events);

        await resolvedRangeStore.setByRange(fromBlock, toBlock);
        logger.info({
          message: `Completed hubpool update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          logger.error({
            message: `Error hubpool updating for block range ${fromBlock} to ${toBlock}`,
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
    });

    return needsProcessing;
  }

  async function fetchEventsByRange(fromBlock: number, toBlock: number) {
    logger.info({
      message: "updating config store client",
      fromBlock,
      toBlock,
    });
    await configStoreClient.update();
    logger.info({
      message: "updated config store client",
      fromBlock,
      toBlock,
    });

    logger.info({
      message: "updating hubpool client",
      fromBlock,
      toBlock,
    });
    await hubPoolClient.update();
    logger.info({
      message: "updated hubpool client",
      fromBlock,
      toBlock,
    });
    const proposedRootBundleEvents = hubPoolClient.getProposedRootBundles();
    const rootBundleCanceledEvents = hubPoolClient.getCancelledRootBundles();
    const rootBundleDisputedEvents = hubPoolClient.getDisputedRootBundles();
    const rootBundleExecutedEvents = hubPoolClient.getExecutedRootBundles();
    return {
      proposedRootBundleEvents,
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents,
    };
  }
  async function storeEvents(params: {
    proposedRootBundleEvents: across.interfaces.ProposedRootBundle[];
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
