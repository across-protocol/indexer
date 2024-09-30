import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import { connectToDatabase } from "./database/database.provider";
import * as parseEnv from "./parseEnv";
import { RetryProvidersFactory } from "./web3/RetryProvidersFactory";
import { RedisCache } from "./redis/redisCache";

async function initializeRedis(
  config: parseEnv.RedisConfig,
  logger: winston.Logger,
) {
  const redis = new Redis({
    ...config,
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

export async function Main(config: parseEnv.Config, logger: winston.Logger) {
  const { redisConfig, postgresConfig, hubConfig, spokeConfigs } = config;
  const redis = await initializeRedis(redisConfig, logger);
  const redisCache = new RedisCache(redis);
  const retryProvidersFactory = new RetryProvidersFactory(redisCache, logger);
  const postgres = await connectToDatabase(postgresConfig, logger);
  const bundleProcessor = new services.bundles.Processor({
    logger,
    redis,
    postgres,
  });
  const hubPoolIndexer = new services.hubPoolIndexer.Indexer({
    logger,
    redis,
    postgres,
    ...hubConfig,
  });
  const spokePoolIndexers = spokeConfigs.map((spokeConfig) => {
    return new services.spokePoolIndexer.Indexer({
      logger,
      redis,
      postgres,
      ...spokeConfig,
    });
  });

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
      bundleProcessor.start(10),
      hubPoolIndexer.start(10),
      ...spokePoolIndexers.map((s) => s.start(10)),
    ]);

  logger.info({
    at: "Indexer#Main",
    message: "Indexer loop completed",
    results: {
      spokeIndexerRunSuccess: [...spokeResults].every(
        (r) => r.status === "fulfilled",
      ),
      bundleProcessorRunSuccess: bundleResults.status === "fulfilled",
      hubPoolRunSuccess: hubPoolResult.status === "fulfilled",
    },
  });

  redis?.quit();
  postgres?.destroy();
  logger.info("Exiting indexer");
}
