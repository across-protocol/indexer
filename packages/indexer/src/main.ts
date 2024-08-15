import assert from "assert";
import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as acrossConstants from "@across-protocol/constants";
import { DatabaseConfig } from "@repo/indexer-database";
import { connectToDatabase } from "./database/database.provider";

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type RedisConfig = {
  host: string;
  port: number;
};
async function initializeRedis(config: RedisConfig, logger: winston.Logger) {
  const redis = new Redis(config);

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

export async function Main(
  env: Record<string, string | undefined>,
  logger: winston.Logger,
) {
  let running = true;
  // Handle Ctrl+C (SIGINT)
  process.on("SIGINT", async () => {
    logger.info(
      "SIGINT received. Please wait or CTRL + c again to forcefully exit...",
    );
    running = false;
  });
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

  // optional postgresConfig
  const postgresConfig = getPostgresConfig(env);
  const postgres = postgresConfig
    ? await connectToDatabase(postgresConfig, logger)
    : undefined;

  logger.info({
    message: "Starting indexer",
    redisConfig,
    postgresConfig,
    spokePoolProviderUrls,
    hubPoolProviderUrl,
  });
  const depositIndexer = await services.deposits.Indexer({
    spokePoolProviderUrls,
    hubPoolProviderUrl,
    logger,
    redis,
    postgres,
  });

  // TODO: add looping to keep process going
  // do {
  logger.info("index loop starting");
  await depositIndexer(Date.now());
  logger.info("index loop complete");
  // sleep(30000);
  // } while (running);

  redis && redis.disconnect();
  logger.info("Exiting indexer");
}
