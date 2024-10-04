import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import * as acrossConstants from "@across-protocol/constants";
import { providers } from "ethers";

import { connectToDatabase } from "./database/database.provider";
import * as parseEnv from "./parseEnv";
import { RetryProvidersFactory } from "./web3/RetryProvidersFactory";
import { RedisCache } from "./redis/redisCache";
import { DatabaseConfig } from "@repo/indexer-database";
import { HubPoolIndexerDataHandler } from "./services/HubPoolIndexerDataHandler";
import * as utils from "./utils";
import {
  getFinalisedBlockBufferDistance,
  getLoopWaitTimeSeconds,
  Indexer,
} from "./data-indexing/service";
import { HubPoolRepository } from "./database/HubPoolRepository";

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
  const { redisConfig, postgresConfig, spokeConfigs } = config;
  const redis = await initializeRedis(redisConfig, logger);
  const redisCache = new RedisCache(redis);
  const retryProvidersFactory = new RetryProvidersFactory(redisCache, logger);
  retryProvidersFactory.initializeProviders();
  const postgres = await connectToDatabase(postgresConfig, logger);
  const bundleProcessor = new services.bundles.Processor({
    logger,
    redis,
    postgres,
  });
  const spokePoolIndexers = spokeConfigs.map((spokeConfig) => {
    return new services.spokePoolIndexer.Indexer({
      logger,
      redis,
      postgres,
      ...spokeConfig,
    });
  });

  const hubPoolIndexerDataHandler = new HubPoolIndexerDataHandler(
    logger,
    acrossConstants.CHAIN_IDs.MAINNET,
    retryProvidersFactory.getProviderForChainId(
      acrossConstants.CHAIN_IDs.MAINNET,
    ),
    new HubPoolRepository(postgres, logger),
  );
  const hubPoolIndexer = new Indexer(
    {
      loopWaitTimeSeconds: getLoopWaitTimeSeconds(
        acrossConstants.CHAIN_IDs.MAINNET,
      ),
      finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(
        acrossConstants.CHAIN_IDs.MAINNET,
      ),
    },
    hubPoolIndexerDataHandler,
    retryProvidersFactory.getProviderForChainId(
      acrossConstants.CHAIN_IDs.MAINNET,
    ),
    new RedisCache(redis),
    logger,
  );
  await hubPoolIndexer.start();

  let exitRequested = false;
  process.on("SIGINT", () => {
    if (!exitRequested) {
      logger.info(
        "\nWait for shutdown, or press Ctrl+C again to forcefully exit.",
      );
      spokePoolIndexers.map((s) => s.stop());
      hubPoolIndexer.stopGracefully();
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
  const [bundleResults, ...spokeResults] =
    await Promise.allSettled([
      bundleProcessor.start(10),
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
    },
  });

  redis?.quit();
  postgres?.destroy();
  logger.info("Exiting indexer");
}
