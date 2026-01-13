import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import { WebhookFactory } from "@repo/webhooks";
import { CHAIN_IDs } from "@across-protocol/constants";

import { connectToDatabase } from "./database/database.provider";
import { RedisCache } from "./redis/redisCache";
import * as parseEnv from "./parseEnv";
// Factories
import { RetryProvidersFactory } from "./web3/RetryProvidersFactory";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "./utils/contractFactoryUtils";
// Managers
import { AcrossIndexerManager } from "./data-indexing/service/AcrossIndexerManager";
import { BundleServicesManager } from "./services/BundleServicesManager";
import { HotfixServicesManager } from "./services/HotfixServicesManager";
// Repositories
import { BundleRepository } from "./database/BundleRepository";
import { HubPoolRepository } from "./database/HubPoolRepository";
import { SpokePoolRepository } from "./database/SpokePoolRepository";
import { SwapBeforeBridgeRepository } from "./database/SwapBeforeBridgeRepository";
import { utils as dbUtils } from "@repo/indexer-database";
// Queues Workers
import { IndexerQueuesService } from "./messaging/service";
import { IntegratorIdWorker } from "./messaging/IntegratorIdWorker";
import { PriceWorker } from "./messaging/priceWorker";
import { SwapWorker } from "./messaging/swapWorker";
import { CallsFailedRepository } from "./database/CallsFailedRepository";
import { SwapMetadataRepository } from "./database/SwapMetadataRepository";
import { CCTPRepository } from "./database/CctpRepository";
import { OftRepository } from "./database/OftRepository";
import { CCTPIndexerManager } from "./data-indexing/service/CCTPIndexerManager";
import { OFTIndexerManager } from "./data-indexing/service/OFTIndexerManager";
import { CctpFinalizerServiceManager } from "./data-indexing/service/CctpFinalizerService";
import { startWebSocketIndexing } from "./data-indexing/service/indexing";
import { DataDogMetricsService } from "./services/MetricsService";

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
    new SwapBeforeBridgeRepository(postgres, logger),
    new CallsFailedRepository(postgres, logger),
    new SwapMetadataRepository(postgres, logger),
    new BundleRepository(postgres, logger, true),
    indexerQueuesService,
    write,
  );
  const cctpIndexerManager = new CCTPIndexerManager(
    logger,
    config,
    postgres,
    retryProvidersFactory,
    new CCTPRepository(postgres, logger),
  );
  const oftIndexerManager = new OFTIndexerManager(
    logger,
    config,
    postgres,
    retryProvidersFactory,
    new OftRepository(postgres, logger),
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
  const hotfixServicesManager = new HotfixServicesManager(
    logger,
    postgres,
    config,
    retryProvidersFactory,
    indexerQueuesService,
  );
  const cctpFinalizerServiceManager = new CctpFinalizerServiceManager(
    logger,
    config,
    postgres,
  );

  // Set up message workers
  const integratorIdWorker = new IntegratorIdWorker(
    redis,
    postgres,
    logger,
    retryProvidersFactory,
  );
  const priceWorker = config.enablePriceWorker
    ? new PriceWorker(redis, postgres, logger, {
        coingeckoApiKey: config.coingeckoApiKey,
      })
    : undefined;

  const swapWorker = new SwapWorker(
    redis,
    postgres,
    retryProvidersFactory,
    logger,
    {
      coingeckoApiKey: config.coingeckoApiKey,
    },
  );

  const metrics = new DataDogMetricsService({
    configuration: config.datadogConfig,
    logger,
  });

  // WebSocket Indexer setup
  const wsIndexerPromises: Promise<void>[] = [];
  const abortController = new AbortController();

  if (process.env.ENABLE_WEBSOCKET_INDEXER === "true") {
    // Merge providers, allowing WS providers to override RPC providers if defined for a chain
    const allProviders = new Map([
      ...parseEnv.parseProvidersUrls("RPC_PROVIDER_URLS_"),
      ...parseEnv.parseProvidersUrls("WS_RPC_PROVIDER_URLS_"),
    ]);

    // Start all configured WS indexers
    const handlers = startWebSocketIndexing({
      repo: new dbUtils.BlockchainEventRepository(postgres, logger),
      logger,
      providers: allProviders,
      sigterm: abortController.signal,
      metrics,
      config,
    });
    wsIndexerPromises.push(...handlers);
  }

  let exitRequested = false;
  process.on("SIGINT", () => {
    if (!exitRequested) {
      logger.info({
        at: "Indexer#Main",
        message: "Wait for shutdown, or press Ctrl+C again to forcefully exit.",
      });
      integratorIdWorker.close();
      priceWorker?.close();
      swapWorker.close();
      metrics.close();
      acrossIndexerManager.stopGracefully();
      cctpIndexerManager.stopGracefully();
      oftIndexerManager.stopGracefully();
      bundleServicesManager.stop();
      hotfixServicesManager.stop();
      cctpFinalizerServiceManager.stopGracefully();
      abortController.abort(); // Signal WS indexers to stop
    } else {
      integratorIdWorker.close();
      swapWorker.close();
      metrics.close();
      logger.info({ at: "Indexer#Main", message: "Forcing exit..." });
      redis?.quit();
      postgres?.destroy();
      logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
      logger.close();
      across.utils.delay(5).finally(() => process.exit());
    }
  });

  logger.debug({
    at: "Indexer#Main",
    message: "Running indexers",
  });
  // start all indexers in parallel, will wait for them to complete, but they all loop independently
  const [
    bundleServicesManagerResults,
    acrossIndexerManagerResult,
    cctpIndexerManagerResult,
    oftIndexerManagerResult,
    hotfixServicesManagerResults,
    cctpFinalizerServiceManagerResults,
    ...wsIndexerResults
  ] = await Promise.allSettled([
    bundleServicesManager.start(),
    acrossIndexerManager.start(),
    cctpIndexerManager.start(),
    oftIndexerManager.start(),
    hotfixServicesManager.start(),
    cctpFinalizerServiceManager.start(),
    ...wsIndexerPromises,
  ]);
  logger.info({
    at: "Indexer#Main",
    message: "Indexer loop completed",
    results: {
      bundleServicesManagerRunSuccess:
        bundleServicesManagerResults.status === "fulfilled",
      hotfixServicesManagerRunSuccess:
        hotfixServicesManagerResults.status === "fulfilled",
      acrossIndexerManagerRunSuccess:
        acrossIndexerManagerResult.status === "fulfilled",
      cctpIndexerManagerRunSuccess:
        cctpIndexerManagerResult.status === "fulfilled",
      oftIndexerManagerRunSuccess:
        oftIndexerManagerResult.status === "fulfilled",
      cctpFinalizerServiceManagerRunSuccess:
        cctpFinalizerServiceManagerResults.status === "fulfilled",
      wsIndexerRunSuccess: wsIndexerResults.every(
        (r) => r.status === "fulfilled",
      ),
    },
  });
  await integratorIdWorker.close();
  metrics.close();
  redis?.quit();
  postgres?.destroy();
  logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
}
