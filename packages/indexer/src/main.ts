import assert from "assert";
import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";

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
  const providerUrls: string[] = [
    // eth mainnet
    env.INDEXER_PROVIDER_URL_1,
    // optimism
    env.INDEXER_PROVIDER_URL_10,
    // polygon
    env.INDEXER_PROVIDER_URL_137,
    // zksync
    env.INDEXER_PROVIDER_URL_324,
    // redstone
    env.INDEXER_PROVIDER_URL_690,
    // lisk
    env.INDEXER_PROVIDER_URL_1135,
    // base
    env.INDEXER_PROVIDER_URL_8453,
    // mode
    env.INDEXER_PROVIDER_URL_34443,
    // arbitrum
    env.INDEXER_PROVIDER_URL_42161,
    // linea
    env.INDEXER_PROVIDER_URL_59144,
    // blast
    env.INDEXER_PROVIDER_URL_81457,
    // scroll
    env.INDEXER_PROVIDER_URL_534352,
    // zora
    env.INDEXER_PROVIDER_URL_7777777,
  ].filter((x): x is string => !!x);

  assert(
    providerUrls.length > 0,
    "Must provide a url for at least one provider on one chain, for example: INDEXER_PROVIDER_URL_1",
  );

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

  logger.info({
    message: "Starting indexer",
    redisConfig,
    providerUrls,
  });
  const depositIndexer = await services.deposits.Indexer({
    providerUrls,
    logger,
    redis,
  });

  // do {
  logger.info("index loop starting");
  await depositIndexer(Date.now());
  logger.info("index loop complete");
  // sleep(30000);
  // } while (running);

  redis && redis.disconnect();
  logger.info("Exiting indexer");
}
