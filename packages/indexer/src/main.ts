import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";

import { connectToDatabase } from "./database/database.provider";
import * as parseEnv from "./parseEnv";
import { RetryProvidersFactory } from "./web3/RetryProvidersFactory";
import { RedisCache } from "./redis/redisCache";
import { HubPoolIndexerDataHandler } from "./services/HubPoolIndexerDataHandler";
import {
  getFinalisedBlockBufferDistance,
  getLoopWaitTimeSeconds,
  Indexer,
} from "./data-indexing/service";
import { HubPoolRepository } from "./database/HubPoolRepository";
import { SpokePoolRepository } from "./database/SpokePoolRepository";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "./utils/contractFactoryUtils";
import { SpokePoolIndexerDataHandler } from "./services/SpokePoolIndexerDataHandler";
import { SpokePoolProcessor } from "./services/spokePoolProcessor";

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
  const { redisConfig, postgresConfig, spokePoolChainsEnabled, hubChainId } =
    config;
  const redis = await initializeRedis(redisConfig, logger);
  const redisCache = new RedisCache(redis);
  const postgres = await connectToDatabase(postgresConfig, logger);
  const retryProvidersFactory = new RetryProvidersFactory(
    redisCache,
    logger,
  ).initializeProviders();
  const configStoreClientFactory = new ConfigStoreClientFactory(
    retryProvidersFactory,
    logger,
    undefined,
  );
  const hubPoolClientFactory = new HubPoolClientFactory(
    retryProvidersFactory,
    logger,
    { configStoreClientFactory },
  );
  const spokePoolClientFactory = new SpokePoolClientFactory(
    retryProvidersFactory,
    logger,
    { hubPoolClientFactory },
  );

  const bundleProcessor = new services.bundles.Processor({
    logger,
    redis,
    postgres,
  });

  const spokePoolIndexers = spokePoolChainsEnabled.map((chainId) => {
    const spokePoolIndexerDataHandler = new SpokePoolIndexerDataHandler(
      logger,
      chainId,
      hubChainId,
      retryProvidersFactory.getProviderForChainId(chainId),
      configStoreClientFactory,
      hubPoolClientFactory,
      spokePoolClientFactory,
      new SpokePoolRepository(postgres, logger),
      new SpokePoolProcessor(postgres, logger, chainId),
    );
    const spokePoolIndexer = new Indexer(
      {
        loopWaitTimeSeconds: getLoopWaitTimeSeconds(chainId),
        finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(chainId),
      },
      spokePoolIndexerDataHandler,
      retryProvidersFactory.getProviderForChainId(chainId),
      redisCache,
      logger,
    );
    return spokePoolIndexer;
  });

  const hubPoolIndexerDataHandler = new HubPoolIndexerDataHandler(
    logger,
    hubChainId,
    configStoreClientFactory,
    hubPoolClientFactory,
    new HubPoolRepository(postgres, logger),
  );
  const indexer = new Indexer(
    {
      loopWaitTimeSeconds: getLoopWaitTimeSeconds(hubChainId),
      finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(hubChainId),
    },
    hubPoolIndexerDataHandler,
    retryProvidersFactory.getProviderForChainId(hubChainId),
    new RedisCache(redis),
    logger,
  );

  let exitRequested = false;
  process.on("SIGINT", () => {
    if (!exitRequested) {
      logger.info(
        "\nWait for shutdown, or press Ctrl+C again to forcefully exit.",
      );
      spokePoolIndexers.map((s) => s.stopGracefully());
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
  const [bundleResults, hubPoolResult, ...spokeResults] =
    await Promise.allSettled([
      bundleProcessor.start(10),
      hubPoolIndexer.start(),
      ...spokePoolIndexers.map((s) => s.start()),
    ]);

  logger.info({
    at: "Indexer#Main",
    message: "Indexer loop completed",
    results: {
      spokeIndexerRunSuccess: [...spokeResults].every(
        (r) => r.status === "fulfilled",
      ),
      bundleProcessorRunSuccess: bundleResults.status === "fulfilled",
      hubPoolIndexerRunSuccess: hubPoolResult.status === "fulfilled",
    },
  });

  redis?.quit();
  postgres?.destroy();
  logger.info("Exiting indexer");
}
