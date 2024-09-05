import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";
import { providers, Contract } from "ethers";
import winston from "winston";
import Redis from "ioredis";
import { RedisCache } from "../redisCache";
import { DataSource, entities } from "@repo/indexer-database";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { HubPoolRepository } from "../database/HubPoolRepository";
import { IndexerQueues, IndexerQueuesService } from "../messaging/service";
import {
  RelayHashInfoMessage,
  RelayHashInfoWorker,
} from "../messaging/RelayHashInfoWorker";
import { RelayStatusWorker } from "../messaging/RelayStatusWorker";

// from https://github.com/across-protocol/relayer/blob/master/src/common/Constants.ts#L30
export const CONFIG_STORE_VERSION = 4;

type GetSpokeClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
  hubPoolClient: across.clients.HubPoolClient;
};

export async function getSpokeClient(
  params: GetSpokeClientParams,
): Promise<across.clients.SpokePoolClient> {
  const { provider, logger, redis, maxBlockLookBack, chainId, hubPoolClient } =
    params;
  const address = getDeployedAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const latestBlockNumber = await provider.getBlockNumber();
  // for testing
  let lastProcessedBlockNumber: number = latestBlockNumber - 10000;

  // need persistence for this, use it to resume query
  // let lastProcessedBlockNumber: number = deployedBlockNumber;
  // if (redis) {
  //   lastProcessedBlockNumber = Number(
  //     (await redis.get(getLastBlockSearchedKey("spokePool", chainId))) ??
  //       lastProcessedBlockNumber,
  //   );
  // }
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  logger.info({
    message: "creating spoke client for deposit indexer",
    chainId,
    address,
    deployedBlockNumber,
    latestBlockNumber,
    eventSearchConfig,
    blocksBehind: latestBlockNumber - lastProcessedBlockNumber,
    usingRedis: !!redis,
  });
  const spokePoolContract = new Contract(
    address,
    SpokePoolFactory.abi,
    provider,
  );
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
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
};

export async function getConfigStoreClient(params: GetConfigStoreClientParams) {
  const { provider, logger, redis, maxBlockLookBack, chainId } = params;
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
  const latestBlockNumber = await provider.getBlockNumber();
  // for testing
  let lastProcessedBlockNumber: number = latestBlockNumber - 10000;
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
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
  configStoreClient: across.clients.AcrossConfigStoreClient;
};

export async function getHubPoolClient(params: GetHubPoolClientParams) {
  const {
    provider,
    logger,
    redis,
    maxBlockLookBack,
    chainId,
    configStoreClient,
  } = params;
  const address = getDeployedAddress("HubPool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("HubPool", chainId);

  const hubPoolContract = new Contract(address, HubPoolFactory.abi, provider);
  const latestBlockNumber = await provider.getBlockNumber();
  // for testing
  let lastProcessedBlockNumber: number = latestBlockNumber - 10000;
  // if (redis) {
  //   lastProcessedBlockNumber = Number(
  //     (await redis.get(getLastBlockSearchedKey("hubPool", chainId))) ??
  //       lastProcessedBlockNumber,
  //   );
  // }
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  logger.info({
    message: "Initializing hubpool",
    chainId,
    redis: !!redis,
    ...eventSearchConfig,
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

function getLastBlockSearchedKey(
  clientName: "hubPool" | "spokePool" | "configStore",
  chainId: number,
): string {
  return [
    "depositIndexer",
    clientName,
    "lastProcessedBlockNumber",
    chainId,
  ].join("~");
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
  spokePoolProviderUrls: string[];
  hubPoolProviderUrl: string;
  maxBlockLookBack?: number;
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource | undefined;
  indexerQueuesService?: IndexerQueuesService;
  retryProviderConfig?: RetryProviderConfig;
};

export async function Indexer(config: Config) {
  const {
    spokePoolProviderUrls,
    hubPoolProviderUrl,
    maxBlockLookBack = 10000,
    logger,
    redis,
    postgres,
    indexerQueuesService,
    retryProviderConfig,
  } = config;

  let redisCache = undefined;
  if (redis && retryProviderConfig) {
    redisCache = new RedisCache(redis);
  }
  // This is weird but we need to get the chain id from the provider, before calling the retry provider
  const tempProvider = new providers.JsonRpcProvider(hubPoolProviderUrl);
  const hubPoolNetworkInfo = await tempProvider.getNetwork();
  const hubPoolProvider =
    redisCache && retryProviderConfig
      ? getRetryProvider({
          ...retryProviderConfig,
          cache: redisCache,
          logger,
          providerUrl: hubPoolProviderUrl,
          chainId: hubPoolNetworkInfo.chainId,
        })
      : tempProvider;

  const configStoreClient = await getConfigStoreClient({
    provider: hubPoolProvider,
    logger,
    redis,
    maxBlockLookBack,
    chainId: hubPoolNetworkInfo.chainId,
  });
  const hubPoolClient = await getHubPoolClient({
    provider: hubPoolProvider,
    logger,
    redis,
    maxBlockLookBack,
    chainId: hubPoolNetworkInfo.chainId,
    configStoreClient,
  });

  const spokeClientEntries: [number, across.clients.SpokePoolClient][] =
    await Promise.all(
      spokePoolProviderUrls.map(async (providerUrl) => {
        const tempProvider = new providers.JsonRpcProvider(providerUrl);
        const networkInfo = await tempProvider.getNetwork();
        const { chainId } = networkInfo;

        const provider =
          redisCache && retryProviderConfig
            ? getRetryProvider({
                ...retryProviderConfig,
                cache: redisCache,
                logger,
                providerUrl,
                chainId,
              })
            : tempProvider;

        return [
          chainId,
          await getSpokeClient({
            provider,
            logger,
            redis,
            maxBlockLookBack,
            chainId,
            hubPoolClient,
          }),
        ];
      }),
    );

  const dbThrowError = false; // TODO: delete this when we implement the indexing loop
  const hubPoolRepository = postgres
    ? new HubPoolRepository(postgres, logger, dbThrowError)
    : undefined;
  const spokePoolClientRepository = postgres
    ? new SpokePoolRepository(postgres, logger, dbThrowError)
    : undefined;
  // Set up Workers
  if (redis && postgres && indexerQueuesService) {
    new RelayHashInfoWorker(redis, postgres, indexerQueuesService);
    new RelayStatusWorker(redis, postgres);
  }

  async function publishRelayHashInfoMessage(
    event:
      | entities.V3FundsDeposited
      | entities.FilledV3Relay
      | entities.RequestedV3SlowFill,
    eventType: "V3FundsDeposited" | "FilledV3Relay" | "RequestedV3SlowFill",
  ) {
    const message: RelayHashInfoMessage = {
      relayHash: event.relayHash,
      eventType,
      eventId: event.id,
      depositId: event.depositId,
      originChainId: event.originChainId,
    };
    await indexerQueuesService?.publishMessage(
      IndexerQueues.RelayHashInfo,
      IndexerQueues.RelayHashInfo, // use queue name as job name
      message,
    );
  }

  async function updateHubPool(now: number, chainId: number) {
    logger.info("Starting hub pool client update");
    await hubPoolClient.update();

    const proposedRootBundleEvents = hubPoolClient.getProposedRootBundles();
    const rootBundleCanceledEvents = hubPoolClient.getCancelledRootBundles();
    const rootBundleDisputedEvents = hubPoolClient.getDisputedRootBundles();
    const rootBundleExecutedEvents = hubPoolClient.getExecutedRootBundles();
    if (hubPoolRepository) {
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

    const latestBlockSearched = hubPoolClient.latestBlockSearched;
    logger.info({
      message: "Finished updating hub pool client",
      chainId,
      latestBlockSearched,
    });
    if (redis) {
      await redis.set(
        getLastBlockSearchedKey("hubPool", chainId),
        latestBlockSearched,
      );
    }
  }

  async function updateConfigStore(now: number, chainId: number) {
    logger.info("Starting config store update");
    await configStoreClient.update();
    // TODO: store any data we need for configs in index
    const latestBlockSearched = configStoreClient.latestBlockSearched;
    logger.info({
      message: "Finished updating config store client",
      chainId,
      latestBlockSearched,
    });
  }

  async function updateSpokePool(
    now: number,
    chainId: number,
    spokeClient: across.clients.SpokePoolClient,
  ) {
    logger.info({
      message: "Starting update on spoke client",
      chainId,
    });
    await spokeClient.update();
    // TODO: store any data we need for configs in index

    const v3FundsDepositedEvents = spokeClient.getDeposits();
    const filledV3RelayEvents = spokeClient.getFills();
    const requestedV3SlowFillEvents =
      spokeClient.getSlowFillRequestsForOriginChain(chainId);
    const requestedSpeedUpV3Events = spokeClient.getSpeedUps();
    const relayedRootBundleEvents = spokeClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokeClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokeClient.getTokensBridged();

    if (spokePoolClientRepository) {
      const savedV3FundsDepositedEvents =
        await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
          v3FundsDepositedEvents,
        );
      savedV3FundsDepositedEvents.forEach(async (event) => {
        if (event) {
          await publishRelayHashInfoMessage(event, "V3FundsDeposited");
        }
      });

      const savedRequestedV3SlowFillEvents =
        await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
          requestedV3SlowFillEvents,
        );
      savedRequestedV3SlowFillEvents?.forEach(async (event) => {
        await publishRelayHashInfoMessage(event, "RequestedV3SlowFill");
      });

      await spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
        requestedSpeedUpV3Events,
      );

      const savedFilledV3RelayEvents =
        await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
          filledV3RelayEvents,
        );
      savedFilledV3RelayEvents.forEach(async (event) => {
        if (event) {
          await publishRelayHashInfoMessage(event, "FilledV3Relay");
        }
      });
      await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
        relayedRootBundleEvents,
        chainId,
      );
      await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
      );
      await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
        tokensBridgedEvents,
      );
    }

    const latestBlockSearched = spokeClient.latestBlockSearched;
    logger.info({
      message: "Finished updating spoke client",
      chainId,
      latestBlockSearched,
      v3FundsDepositedEvents: v3FundsDepositedEvents.length,
      filledV3RelayEvents: filledV3RelayEvents.length,
      requestedV3SlowFillEvents: requestedV3SlowFillEvents.length,
      requestedSpeedUpV3DepositEvents: requestedSpeedUpV3Events.length,
      relayedRootBundles: relayedRootBundleEvents.length,
      executedRelayerRefundRoot: executedRelayerRefundRootEvents.length,
      tokensBridged: tokensBridgedEvents.length,
    });
    if (redis) {
      await redis.set(
        getLastBlockSearchedKey("spokePool", chainId),
        latestBlockSearched,
      );
    }
  }

  return async function updateAll(now: number) {
    await updateConfigStore(now, hubPoolNetworkInfo.chainId);
    await updateHubPool(now, hubPoolNetworkInfo.chainId);
    // using all instead of all settled for now to make sure we easily see errors
    await Promise.all(
      spokeClientEntries.map(async ([chainId, spokeClient]) =>
        updateSpokePool(now, chainId, spokeClient),
      ),
    );
  };
}
