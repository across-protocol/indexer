import assert from "assert";
import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as s from "superstruct";
import * as acrossConstants from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";
import { connectToDatabase } from "./database/database.provider";
import { IndexerQueuesService } from "./messaging/service";
import { RelayStatusWorker } from "./messaging/RelayStatusWorker";
import { RelayHashInfoWorker } from "./messaging/RelayHashInfoWorker";
import { providers } from "ethers";
import { DatabaseConfig } from "@repo/indexer-database";

type RedisConfig = {
  host: string;
  port: number;
};
async function initializeRedis(config: RedisConfig, logger: winston.Logger) {
  const redis = new Redis({
    ...config,
    // @dev: this config is needed for bullmq workers
    maxRetriesPerRequest: null,
  });

  return new Promise<Redis>((resolve, reject) => {
    redis.on("ready", () => {
      logger.info("Redis connection established.", config);
      resolve(redis);
    });

    redis.on("error", (err) => {
      logger.error("Redis connection error:", err);
      reject(err);
    });
  });
}

function getPostgresConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig {
  assert(env.DATABASE_HOST, "requires DATABASE_HOST");
  assert(env.DATABASE_PORT, "requires DATABASE_PORT");
  assert(env.DATABASE_USER, "requires DATABASE_USER");
  assert(env.DATABASE_PASSWORD, "requires DATABASE_PASSWORD");
  assert(env.DATABASE_NAME, "requires DATABASE_NAME");
  return {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    dbName: env.DATABASE_NAME,
  };
}

// superstruct coersion to turn string into an int and validate
const stringToInt = s.coerce(s.number(), s.string(), (value) =>
  parseInt(value),
);
function getRetryProviderConfig(
  env: Record<string, string | undefined>,
): services.deposits.RetryProviderConfig {
  assert(env.PROVIDER_CACHE_NAMESPACE, "requires PROVIDER_CACHE_NAMESPACE");
  assert(env.MAX_CONCURRENCY, "requires MAX_CONCURRENCY");
  assert(env.PCT_RPC_CALLS_LOGGED, "requires PCT_RPC_CALLS_LOGGED");
  assert(
    env.STANDARD_TTL_BLOCK_DISTANCE,
    "requires STANDARD_TTL_BLOCK_DISTANCE",
  );
  assert(env.NO_TTL_BLOCK_DISTANCE, "requires NO_TTL_BLOCK_DISTANCE");
  assert(env.PROVIDER_CACHE_TTL, "requires PROVIDER_CACHE_TTL");
  assert(env.NODE_QUORUM_THRESHOLD, "requires NODE_QUORUM_THRESHOLD");
  assert(env.RETRIES, "requires RETRIES");
  assert(env.DELAY, "requires DELAY");
  return {
    providerCacheNamespace: env.PROVIDER_CACHE_NAMESPACE,
    maxConcurrency: s.create(env.MAX_CONCURRENCY, stringToInt),
    pctRpcCallsLogged: s.create(env.PCT_RPC_CALLS_LOGGED, stringToInt),
    standardTtlBlockDistance: s.create(
      env.STANDARD_TTL_BLOCK_DISTANCE,
      stringToInt,
    ),
    noTtlBlockDistance: s.create(env.NO_TTL_BLOCK_DISTANCE, stringToInt),
    providerCacheTtl: s.create(env.PROVIDER_CACHE_TTL, stringToInt),
    nodeQuorumThreshold: s.create(env.NODE_QUORUM_THRESHOLD, stringToInt),
    retries: s.create(env.RETRIES, stringToInt),
    delay: s.create(env.DELAY, stringToInt),
  };
}

// utility call to create the spoke pool event indexer config
async function getSpokePoolIndexerConfig(params: {
  retryProviderConfig: services.deposits.RetryProviderConfig;
  spokePoolProviderUrl: string;
  hubPoolNetworkInfo: providers.Network;
  hubPoolProviderUrl: string;
}) {
  const {
    retryProviderConfig,
    spokePoolProviderUrl,
    hubPoolProviderUrl,
    hubPoolNetworkInfo,
  } = params;
  const tempSpokeProvider = new providers.JsonRpcProvider(spokePoolProviderUrl);
  const spokePoolNetworkInfo = await tempSpokeProvider.getNetwork();
  return {
    retryProviderConfig,
    configStoreConfig: {
      chainId: hubPoolNetworkInfo.chainId,
      providerUrl: hubPoolProviderUrl,
      maxBlockLookBack: 10000,
    },
    hubConfig: {
      chainId: hubPoolNetworkInfo.chainId,
      providerUrl: hubPoolProviderUrl,
      maxBlockLookBack: 10000,
    },
    spokeConfig: {
      chainId: spokePoolNetworkInfo.chainId,
      providerUrl: spokePoolProviderUrl,
      // TODO: Set this per chain
      maxBlockLookBack: 10000,
    },
    redisKeyPrefix: `spokePoolIndexer:${spokePoolNetworkInfo.chainId}`,
  };
}
// utility call to create the hubpool event indexer config
async function getHubPoolIndexerConfig(params: {
  retryProviderConfig: services.deposits.RetryProviderConfig;
  hubPoolNetworkInfo: providers.Network;
  hubPoolProviderUrl: string;
}) {
  const { retryProviderConfig, hubPoolProviderUrl, hubPoolNetworkInfo } =
    params;
  return {
    retryProviderConfig,
    hubConfig: {
      chainId: hubPoolNetworkInfo.chainId,
      providerUrl: hubPoolProviderUrl,
      maxBlockLookBack: 10000,
    },
    redisKeyPrefix: `hubPoolIndexer:${hubPoolNetworkInfo.chainId}`,
  };
}

export async function Main(
  env: Record<string, string | undefined>,
  logger: winston.Logger,
) {
  const spokePoolProviderUrls: string[] = Object.values(
    acrossConstants.MAINNET_CHAIN_IDs,
  )
    .map((chainId) => env[`INDEXER_SPOKEPOOL_PROVIDER_URL_${chainId}`])
    .filter((x): x is string => !!x);

  assert(
    spokePoolProviderUrls.length > 0,
    "Must provide a url for at least one provider on one chain, for example: INDEXER_SPOKEPOOL_PROVIDER_URL_1",
  );

  assert(
    env.INDEXER_HUBPOOL_PROVIDER_URL,
    "requires INDEXER_HUBPOOL_PROVIDER_URL",
  );
  const hubPoolProviderUrl = env.INDEXER_HUBPOOL_PROVIDER_URL;
  assert(env.INDEXER_REDIS_HOST, "requires INDEXER_REDIS_HOST");
  assert(env.INDEXER_REDIS_PORT, "requires INDEXER_REDIS_PORT");
  const redisConfig = {
    host: env.INDEXER_REDIS_HOST,
    port: Number(env.INDEXER_REDIS_PORT),
  };

  const redis = await initializeRedis(redisConfig, logger);

  const indexerQueuesService = new IndexerQueuesService(redis);

  // optional postgresConfig
  const postgresConfig = getPostgresConfig(env);
  const postgres = await connectToDatabase(postgresConfig, logger);

  // Set up Workers
  new RelayHashInfoWorker(redis, postgres, indexerQueuesService);
  new RelayStatusWorker(redis, postgres);

  const retryProviderConfig = getRetryProviderConfig(env);

  const tempHubProvider = new providers.JsonRpcProvider(hubPoolProviderUrl);
  const hubPoolNetworkInfo = await tempHubProvider.getNetwork();
  const bundleProcessor = services.bundles.Processor({
    logger,
    redis,
    postgres,
  });
  const spokePoolIndexers: Array<services.spokePoolIndexer.SpokePoolIndexer> =
    [];
  const hubPoolIndexerConfig = await getHubPoolIndexerConfig({
    hubPoolNetworkInfo,
    hubPoolProviderUrl,
    retryProviderConfig,
  });
  // canonical hubpool indexer
  const hubPoolIndexer = new services.hubPoolIndexer.Indexer({
    logger,
    redis,
    postgres,
    ...hubPoolIndexerConfig,
  });
  // instanciate multiple spoke pool event indexers
  for (const spokePoolProviderUrl of spokePoolProviderUrls) {
    const config = await getSpokePoolIndexerConfig({
      hubPoolNetworkInfo,
      spokePoolProviderUrl,
      hubPoolProviderUrl,
      retryProviderConfig,
    });
    logger.info({
      message: "Starting indexer",
      ...config,
    });
    const spokeIndexer = await services.spokePoolIndexer.SpokePoolIndexer({
      logger,
      redis,
      postgres,
      ...config,
    });
    spokePoolIndexers.push(spokeIndexer);
  }

  let exitRequested = false;
  process.on("SIGINT", () => {
    if (!exitRequested) {
      logger.info(
        "\nWait for shutdown, or press Ctrl+C again to forcefully exit.",
      );
      spokePoolIndexers.map((s) => s.stop());
      hubPoolIndexer.stop();
    } else {
      logger.info("\nForcing exit...");
      redis?.quit();
      postgres?.destroy();
      logger.info("Exiting indexer");
      across.utils.delay(5).finally(() => process.exit());
    }
  });

  logger.info({
    message: "Running indexers",
    at: "Indexer#Main",
  });
  // start all indexers in parallel, will wait for them to complete, but they all loop independently
  const [bundleResults, hubPoolResult, ...spokeResults] =
    await Promise.allSettled([
      bundleProcessor(),
      hubPoolIndexer.start(10),
      Promise.resolve(),
      // ...spokePoolIndexers.map((s) => s.start(10)),
    ]);

  logger.info({
    at: "Indexer#Main",
    message: "Indexer loop completed",
    results: {
      spokeIndexerRunSuccess: [...spokeResults].every(
        (r) => r.status === "fulfilled",
      ),
      bundleProcessorRunSuccess: bundleResults.status === "fulfilled",
      hubPoolRunSucccess: hubPoolResult.status === "fulfilled",
    },
  });

  redis?.quit();
  postgres?.destroy();
  logger.info("Exiting indexer");
}
