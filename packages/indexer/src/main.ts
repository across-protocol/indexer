import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import {
  JSONValue,
  WebhookFactory,
  WebhookTypes,
  eventProcessors,
} from "@repo/webhooks";
import { providers } from "ethers";

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
import { BenchmarkStats } from "@repo/benchmark";
import { listenForDeposits } from "./utils/benchmarks";

async function initializeRedis(
  config: parseEnv.RedisConfig,
  logger: winston.Logger,
) {
  const redis = new Redis({
    ...config,
  });

  return new Promise<Redis>((resolve, reject) => {
    redis.on("ready", () => {
      logger.debug({
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
        notificationPath: "across-indexer-error",
        error: err,
      });
      reject(err);
    });
  });
}

export async function Main(config: parseEnv.Config, logger: winston.Logger) {
  const { redisConfig, postgresConfig } = config;
  const redis = await initializeRedis(redisConfig, logger);
  const redisCache = new RedisCache(redis);
  const postgres = await connectToDatabase(postgresConfig, logger);
  const depositBenchmark = new BenchmarkStats();
  const providerChainIds = config.allProviderConfigs
    .filter(([_, chainId]) => config.spokePoolChainsEnabled.includes(chainId))
    .map(([providerUrl, chainId]) => ({
      provider: new providers.JsonRpcProvider(providerUrl),
      chainId: Number(chainId),
    }));

  // Call write to kick off webhook calls
  const { write } = await WebhookFactory(config.webhookConfig, {
    postgres,
    logger,
    redis,
  });
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
    (params: { type: WebhookTypes; event: JSONValue }) => {
      // stop any benchmarks based on origin and deposit it
      if (params.type === WebhookTypes.DepositStatus) {
        const depositStatusEvent =
          params.event as eventProcessors.DepositStatusEvent;
        const uniqueId = `${depositStatusEvent.originChainId}-${depositStatusEvent.depositId}`;
        try {
          const duration = depositBenchmark.end(uniqueId);
          logger.debug({
            message: "Profiled deposit",
            duration,
            uniqueId,
            ...depositStatusEvent,
          });
        } catch (err) {
          logger.debug({
            message: "Error profiling deposit",
            uniqueId,
            ...depositStatusEvent,
            err,
          });
          // ignore errors, but it can happen if we are ending before starting
        }
      }
      write(params);
    },
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

  const stopDepositListener = listenForDeposits(
    depositBenchmark,
    providerChainIds,
    logger,
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
      stopDepositListener();
    } else {
      integratorIdWorker.close();
      logger.info({ at: "Indexer#Main", message: "Forcing exit..." });
      redis?.quit();
      postgres?.destroy();
      logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
      across.utils.delay(5).finally(() => process.exit());
    }
  });

  logger.debug({
    at: "Indexer#Main",
    message: "Running indexers",
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
