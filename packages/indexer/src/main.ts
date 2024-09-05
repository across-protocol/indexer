import assert from "assert";
import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as s from "superstruct";
import * as acrossConstants from "@across-protocol/constants";
import { DatabaseConfig } from "@repo/indexer-database";
import { connectToDatabase } from "./database/database.provider";
import { IndexerQueuesService } from "./messaging/service";
import { RelayStatusWorker } from "./messaging/RelayStatusWorker";
import { RelayHashInfoWorker } from "./messaging/RelayHashInfoWorker";
import { providers } from "ethers";

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
): DatabaseConfig | undefined {
  return env.DATABASE_HOST &&
    env.DATABASE_PORT &&
    env.DATABASE_USER &&
    env.DATABASE_PASSWORD &&
    env.DATABASE_NAME
    ? {
        host: env.DATABASE_HOST,
        port: env.DATABASE_PORT,
        user: env.DATABASE_USER,
        password: env.DATABASE_PASSWORD,
        dbName: env.DATABASE_NAME,
      }
    : undefined;
}

// superstruct coersion to turn string into an int and validate
const stringToInt = s.coerce(s.number(), s.string(), (value) =>
  parseInt(value),
);
function getRetryProviderConfig(
  env: Record<string, string | undefined>,
): services.deposits.RetryProviderConfig | undefined {
  return env.PROVIDER_CACHE_NAMESPACE &&
    env.MAX_CONCURRENCY &&
    env.PCT_RPC_CALLS_LOGGED &&
    env.STANDARD_TTL_BLOCK_DISTANCE &&
    env.NO_TTL_BLOCK_DISTANCE &&
    env.PROVIDER_CACHE_TTL &&
    env.NODE_QUORUM_THRESHOLD &&
    env.RETRIES &&
    env.DELAY
    ? {
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
      }
    : undefined;
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
  // optional redis config
  const redisConfig =
    env.INDEXER_REDIS_HOST && env.INDEXER_REDIS_PORT
      ? {
          host: env.INDEXER_REDIS_HOST,
          port: Number(env.INDEXER_REDIS_PORT),
        }
      : undefined;

  const redis = redisConfig
    ? await initializeRedis(redisConfig, logger)
    : undefined;

  const indexerQueuesService = redis
    ? new IndexerQueuesService(redis)
    : undefined;

  // optional postgresConfig
  const postgresConfig = getPostgresConfig(env);
  const postgres = postgresConfig
    ? await connectToDatabase(postgresConfig, logger)
    : undefined;

  // Set up Workers
  if (redis && postgres && indexerQueuesService) {
    new RelayHashInfoWorker(redis, postgres, indexerQueuesService);
    new RelayStatusWorker(redis, postgres);
  }

  const retryProviderConfig = getRetryProviderConfig(env);

  if (postgres && redis && retryProviderConfig) {
    const tempHubProvider = new providers.JsonRpcProvider(hubPoolProviderUrl);
    const hubPoolNetworkInfo = await tempHubProvider.getNetwork();
    // instanciate multiple spoke pool event indexers
    for (const spokePoolProviderUrl of spokePoolProviderUrls) {
      const tempSpokeProvider = new providers.JsonRpcProvider(
        spokePoolProviderUrl,
      );
      const spokePoolNetworkInfo = await tempSpokeProvider.getNetwork();
      const config = {
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
      logger.info({
        message: "Starting indexer",
        ...config,
      });
      const spokeIndexer = await services.spokePoolEvents.SpokePoolEvents({
        logger,
        redis,
        postgres,
        ...config,
      });
      await spokeIndexer.tick();
    }
  }

  // temp disable
  // logger.info({
  //   message: "Starting indexer",
  //   redisConfig,
  //   postgresConfig,
  //   spokePoolProviderUrls,
  //   hubPoolProviderUrl,
  //   retryProviderConfig,
  // });
  // const depositIndexer = await services.deposits.Indexer({
  //   spokePoolProviderUrls,
  //   hubPoolProviderUrl,
  //   logger,
  //   redis,
  //   postgres,
  //   indexerQueuesService,
  //   retryProviderConfig,
  // });

  redis && redis.quit();
  postgres && postgres.destroy();
  logger.info("Exiting indexer");
}
