import assert from "assert";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import winston from "winston";
import * as across from "@across-protocol/sdk";
import { providers, Contract } from "ethers";
import Redis from "ioredis";
import { RedisCache } from "../redis/redisCache";
import { DataSource } from "@repo/indexer-database";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { differenceWith, isEqual } from "lodash";

import { RangeQueryStore, Ranges } from "../redis/rangeQueryStore";

export const CONFIG_STORE_VERSION = 4;

type GetSpokeClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  fromBlock?: number;
  toBlock?: number;
  chainId: number;
  hubPoolClient: across.clients.HubPoolClient;
};

export async function getSpokeClient(
  params: GetSpokeClientParams,
): Promise<across.clients.SpokePoolClient> {
  const { provider, logger, maxBlockLookBack, chainId, hubPoolClient } = params;
  const address = getDeployedAddress("SpokePool", chainId);
  assert(address, `Unable to get spokepool address on chain ${chainId}`);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const toBlock = params.toBlock ?? (await provider.getBlockNumber());
  const fromBlock = params.fromBlock ?? deployedBlockNumber;

  const eventSearchConfig = {
    fromBlock,
    toBlock,
    maxBlockLookBack,
  };
  logger.info({
    message: "Initializing spoke pool",
    chainId,
    address,
    deployedBlockNumber,
    ...eventSearchConfig,
    blockRangeSearched: toBlock - fromBlock,
  });
  const spokePoolContract = SpokePoolFactory.connect(address, provider);
  return new across.clients.SpokePoolClient(
    logger,
    spokePoolContract,
    hubPoolClient,
    chainId,
    deployedBlockNumber,
    eventSearchConfig,
  );
}

type GetConfigStoreClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  chainId: number;
};

export async function getConfigStoreClient(params: GetConfigStoreClientParams) {
  const { provider, logger, maxBlockLookBack, chainId } = params;
  const address = getDeployedAddress("AcrossConfigStore", chainId);
  const deployedBlockNumber = getDeployedBlockNumber(
    "AcrossConfigStore",
    chainId,
  );
  const configStoreContract = new Contract(
    address,
    AcrossConfigStoreFactory.abi,
    provider,
  );
  let lastProcessedBlockNumber: number = deployedBlockNumber;
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  return new across.clients.AcrossConfigStoreClient(
    logger,
    configStoreContract,
    eventSearchConfig,
    CONFIG_STORE_VERSION,
  );
}

type GetHubPoolClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  chainId: number;
  configStoreClient: across.clients.AcrossConfigStoreClient;
  // dont usually need to include these
  fromBlock?: number;
  toBlock?: number;
};

export async function getHubPoolClient(params: GetHubPoolClientParams) {
  const { provider, logger, maxBlockLookBack, chainId, configStoreClient } =
    params;
  const address = getDeployedAddress("HubPool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("HubPool", chainId);

  const hubPoolContract = new Contract(address, HubPoolFactory.abi, provider);
  const fromBlock = params.fromBlock ?? deployedBlockNumber;
  const toBlock = params.toBlock ?? (await provider.getBlockNumber());

  const eventSearchConfig = {
    fromBlock,
    toBlock,
    maxBlockLookBack,
  };
  logger.info({
    message: "Initializing hubpool",
    chainId,
    ...eventSearchConfig,
    blockRangeSearched: toBlock - fromBlock,
  });
  return new across.clients.HubPoolClient(
    logger,
    hubPoolContract,
    configStoreClient,
    deployedBlockNumber,
    chainId,
    eventSearchConfig,
  );
}

export type RetryProviderConfig = {
  providerCacheNamespace: string;
  maxConcurrency: number;
  pctRpcCallsLogged: number;
  standardTtlBlockDistance: number;
  noTtlBlockDistance: number;
  providerCacheTtl: number;
  nodeQuorumThreshold: number;
  retries: number;
  delay: number;
};
type RetryProviderDeps = {
  cache: across.interfaces.CachingMechanismInterface;
  logger: winston.Logger;
  providerUrl: string;
  chainId: number;
};
function getRetryProvider(params: RetryProviderConfig & RetryProviderDeps) {
  return new across.providers.RetryProvider(
    [[params.providerUrl, params.chainId]],
    params.chainId,
    params.nodeQuorumThreshold,
    params.retries,
    params.delay,
    params.maxConcurrency,
    params.providerCacheNamespace,
    params.pctRpcCallsLogged,
    params.cache,
    params.standardTtlBlockDistance,
    params.noTtlBlockDistance,
    params.providerCacheTtl,
    params.logger,
  );
}
type Config = {
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  retryProviderConfig: RetryProviderConfig;
  configStoreConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  hubConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  spokeConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  redisKeyPrefix: string;
};
export async function SpokePoolIndexer(config: Config) {
  const {
    logger,
    redis,
    postgres,
    retryProviderConfig,
    redisKeyPrefix,
    hubConfig,
    spokeConfig,
    configStoreConfig,
  } = config;

  function makeId(...args: Array<string | number>) {
    return [redisKeyPrefix, ...args].join(":");
  }

  const resolvedRangeStore = new RangeQueryStore({
    redis,
    prefix: makeId("rangeQuery", "resolved"),
  });

  const redisCache = new RedisCache(redis);
  const hubPoolProvider = getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...hubConfig,
  });
  const configStoreProvider = getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...configStoreConfig,
  });
  const spokePoolProvider = getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...spokeConfig,
  });

  const spokePoolClientRepository = new SpokePoolRepository(
    postgres,
    logger,
    true,
  );

  const configStoreClient = await getConfigStoreClient({
    logger,
    provider: configStoreProvider,
    maxBlockLookBack: configStoreConfig.maxBlockLookBack,
    chainId: configStoreConfig.chainId,
  });
  const hubPoolClient = await getHubPoolClient({
    configStoreClient,
    provider: hubPoolProvider,
    logger,
    maxBlockLookBack: hubConfig.maxBlockLookBack,
    chainId: hubConfig.chainId,
  });

  async function tick() {
    const allPendingQueries = await getUnprocessedRanges();
    logger.info({
      message: `Running indexer on ${allPendingQueries.length} block range requests`,
    });
    for (const query of allPendingQueries) {
      const [fromBlock, toBlock] = query;
      try {
        logger.info({
          message: `Starting update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
        const events = await fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await storeEvents(events);

        await resolvedRangeStore.setByRange(fromBlock, toBlock);
        logger.info({
          message: `Completed update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          logger.error({
            message: `Error updating for block range ${fromBlock} to ${toBlock}`,
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
      "SpokePool",
      spokeConfig.chainId,
    );
    const spokeLatestBlockNumber =
      toBlock ?? (await spokePoolProvider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: spokeLatestBlockNumber,
      maxBlockLookBack: spokeConfig.maxBlockLookBack,
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
      spokeLatestBlockNumber,
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

    const spokeClient = await getSpokeClient({
      hubPoolClient,
      provider: spokePoolProvider,
      logger,
      maxBlockLookBack: spokeConfig.maxBlockLookBack,
      chainId: spokeConfig.chainId,
      fromBlock,
      toBlock,
    });

    logger.info({
      message: "updating spokepool client",
      fromBlock,
      toBlock,
    });
    await spokeClient.update();
    logger.info({
      message: "updated spokepool client",
      fromBlock,
      toBlock,
    });

    const v3FundsDepositedEvents = spokeClient.getDeposits();
    const filledV3RelayEvents = spokeClient.getFills();
    const requestedV3SlowFillEvents =
      spokeClient.getSlowFillRequestsForOriginChain(spokeConfig.chainId);
    const relayedRootBundleEvents = spokeClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokeClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokeClient.getTokensBridged();

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }
  async function storeEvents(params: {
    v3FundsDepositedEvents: across.interfaces.DepositWithBlock[];
    filledV3RelayEvents: across.interfaces.FillWithBlock[];
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[];
    tokensBridgedEvents: across.interfaces.TokensBridged[];
  }) {
    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    } = params;
    await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
      v3FundsDepositedEvents,
    );
    await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
      requestedV3SlowFillEvents,
    );
    await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
      filledV3RelayEvents,
    );
    await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
      relayedRootBundleEvents,
      spokeConfig.chainId,
    );
    await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
      executedRelayerRefundRootEvents,
    );
    await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
      tokensBridgedEvents,
    );
  }

  return {
    tick,
  };
}
