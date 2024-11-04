import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";

import { connectToDatabase } from "./database/database.provider";
import * as parseEnv from "./parseEnv";
import { RetryProvidersFactory } from "./web3/RetryProvidersFactory";
import { RedisCache } from "./redis/redisCache";
import { HubPoolRepository } from "./database/HubPoolRepository";
import { SpokePoolRepository } from "./database/SpokePoolRepository";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "./utils/contractFactoryUtils";
import { BundleRepository } from "./database/BundleRepository";
import { IndexerQueuesService } from "./messaging/service";
import { IntegratorIdWorker } from "./messaging/IntegratorIdWorker";
import { AcrossIndexerManager } from "./data-indexing/service/AcrossIndexerManager";
import { BundleServicesManager } from "./services/BundleServicesManager";

async function initializeRedis(
  config: parseEnv.RedisConfig,
  logger: winston.Logger,
) {
  const redis = new Redis({
    ...config,
  });

  return new Promise<Redis>((resolve, reject) => {
    redis.on("ready", () => {
      logger.info({
        at: "Indexer#initializeRedis",
        message: "Redis connection established",
        config,
      });
      resolve(redis);
    });

    redis.on("error", (err) => {
      logger.error({
        at: "Indexer#initializeRedis",
        message: "Redis connection failed",
        error: err,
      });
      reject(err);
    });
  });
}

export async function Main(config: parseEnv.Config, logger: winston.Logger) {
  const { redisConfig, postgresConfig, hubChainId } = config;
  const redis = await initializeRedis(redisConfig, logger);
  const redisCache = new RedisCache(redis);
  const postgres = await connectToDatabase(postgresConfig, logger);
  // Retry providers factory
  const retryProvidersFactory = new RetryProvidersFactory(
    redisCache,
    logger,
  ).initializeProviders();
  // SDK clients factories
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
  const indexerQueuesService = new IndexerQueuesService(redis);
  const acrossIndexerManager = new AcrossIndexerManager(
    logger,
    config,
    postgres,
    configStoreClientFactory,
    hubPoolClientFactory,
    spokePoolClientFactory,
    retryProvidersFactory,
    new HubPoolRepository(postgres, logger),
    new SpokePoolRepository(postgres, logger),
    redisCache,
    indexerQueuesService,
  );
  const bundleServicesManager = new BundleServicesManager(
    config,
    logger,
    redis,
    postgres,
    hubPoolClientFactory,
    spokePoolClientFactory,
    configStoreClientFactory,
    retryProvidersFactory,
    new BundleRepository(postgres, logger, true),
  );

  // Set up message workers
  const integratorIdWorker = new IntegratorIdWorker(
    redis,
    postgres,
    logger,
    retryProvidersFactory,
  );

  let exitRequested = false;
  process.on("SIGINT", () => {
    if (!exitRequested) {
      logger.info({
        at: "Indexer#Main",
        message: "Wait for shutdown, or press Ctrl+C again to forcefully exit.",
      });
      integratorIdWorker.close();
      acrossIndexerManager.stopGracefully();
      bundleServicesManager.stop();
    } else {
      integratorIdWorker.close();
      logger.info({ at: "Indexer#Main", message: "Forcing exit..." });
      redis?.quit();
      postgres?.destroy();
      logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
      across.utils.delay(5).finally(() => process.exit());
    }
  });

  logger.info({
    message: "Running indexers",
    at: "Indexer#Main",
  });
  // start all indexers in parallel, will wait for them to complete, but they all loop independently
  const [bundleServicesManagerResults, acrossIndexerManagerResult] =
    await Promise.allSettled([
      bundleServicesManager.start(),
      acrossIndexerManager.start(),
    ]);

  logger.info({
    at: "Indexer#Main",
    message: "Indexer loop completed",
    results: {
      bundleServicesManagerRunSuccess:
        bundleServicesManagerResults.status === "fulfilled",
      acrossIndexerManagerRunSuccess:
        acrossIndexerManagerResult.status === "fulfilled",
    },
  });
  await integratorIdWorker.close();
  redis?.quit();
  postgres?.destroy();
  logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
}
