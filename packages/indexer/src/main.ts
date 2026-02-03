import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import { WebhookFactory } from "@repo/webhooks";

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
import { CctpFinalizerServiceManager } from "./data-indexing/service/CctpFinalizerService";
import { CCTPIndexerManager } from "./data-indexing/service/CCTPIndexerManager";
import { HotfixServicesManager } from "./services/HotfixServicesManager";
import { HyperliquidIndexerManager } from "./data-indexing/service/HyperliquidIndexerManager";
import { MonitoringManager } from "./monitoring/MonitoringManager";
import { OFTIndexerManager } from "./data-indexing/service/OFTIndexerManager";
// Repositories
import { BundleRepository } from "./database/BundleRepository";
import { CallsFailedRepository } from "./database/CallsFailedRepository";
import { CCTPRepository } from "./database/CctpRepository";
import { HubPoolRepository } from "./database/HubPoolRepository";
import { HyperliquidDepositHandlerRepository } from "./database/HyperliquidDepositHandlerRepository";
import { OftRepository } from "./database/OftRepository";
import { SpokePoolRepository } from "./database/SpokePoolRepository";
import { SwapBeforeBridgeRepository } from "./database/SwapBeforeBridgeRepository";
import { SwapMetadataRepository } from "./database/SwapMetadataRepository";
import { utils as dbUtils } from "@repo/indexer-database";
// Queues Workers
import { IndexerQueuesService } from "./messaging/service";
import { IntegratorIdWorker } from "./messaging/IntegratorIdWorker";
import { PriceWorker } from "./messaging/priceWorker";
import { SwapWorker } from "./messaging/swapWorker";
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
    new HyperliquidDepositHandlerRepository(postgres, logger),
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
  const hyperliquidIndexerManager = new HyperliquidIndexerManager(
    logger,
    config,
    postgres,
  );
  const monitoringManager = new MonitoringManager(logger, config, postgres);

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
    tags: ["websocket"],
  });

  // WebSocket Indexer setup
  const wsIndexerPromises: { chainId: number; promise: Promise<void> }[] = [];
  const abortController = new AbortController();

  if (process.env.ENABLE_WEBSOCKET_INDEXER === "true") {
    // Merge providers, allowing WS providers to override RPC providers if defined for a chain
    const allProviders = new Map([
      ...parseEnv.parseProvidersUrls("RPC_PROVIDER_URLS_"),
      ...parseEnv.parseProvidersUrls("WS_RPC_PROVIDER_URLS_"),
    ]);

    // Start all configured WS indexers
    const handlers = startWebSocketIndexing({
      database: postgres,
      logger,
      providers: allProviders,
      sigterm: abortController.signal,
      metrics,
      config,
    });
    wsIndexerPromises.push(...handlers);
  }

  let isShuttingDown = false;
  let shutdownTimestamp = 0; // Track when the first shutdown started
  const shutdown = async (signal: string) => {
    const now = Date.now();
    if (isShuttingDown) {
      // If the second signal arrives within 2 seconds of the first, ignore it
      // This filters out the "echo" signal from process managers
      if (now - shutdownTimestamp < 2000) {
        return;
      }
      logger.info({
        at: "Indexer#Main",
        message: `Received second signal ${signal}, forcing exit.`,
      });
      process.exit(1);
    }
    isShuttingDown = true;
    shutdownTimestamp = now;
    logger.info({
      at: "Indexer#Main",
      message: `Received ${signal}. Starting graceful shutdown...`,
    });

    // Signal the WebSocket indexers to stop and close sockets immediately
    abortController.abort();
    await Promise.allSettled([
      integratorIdWorker.close(),
      priceWorker?.close(),
      swapWorker.close(),
      metrics.close(),
    ]);
    // Stop all other managers

    logger.info({
      at: "Indexer#Main",
      message:
        "Graceful shutdown trigger complete. Indexer loop should finish shortly.",
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // start all indexers in parallel, will wait for them to complete, but they all loop independently
  const indexerPromises = [
    {
      name: "bundleServicesManager",
      promise: bundleServicesManager.start(abortController.signal),
    },
    {
      name: "acrossIndexerManager",
      promise: acrossIndexerManager.start(abortController.signal),
    },
    {
      name: "cctpIndexerManager",
      promise: cctpIndexerManager.start(abortController.signal),
    },
    {
      name: "oftIndexerManager",
      promise: oftIndexerManager.start(abortController.signal),
    },
    {
      name: "hyperliquidIndexerManager",
      promise: hyperliquidIndexerManager.start(abortController.signal),
    },
    {
      name: "hotfixServicesManager",
      promise: hotfixServicesManager.start(abortController.signal),
    },
    {
      name: "cctpFinalizerServiceManager",
      promise: cctpFinalizerServiceManager.start(abortController.signal),
    },
    {
      name: "monitoringManager",
      promise: monitoringManager.start(abortController.signal),
    },
    ...wsIndexerPromises.map((p) => ({
      name: `wsIndexer-${p.chainId}`,
      promise: p.promise,
    })),
  ];

  // Track pending services for debugging shutdown hangs
  const pendingServices = new Set<string>();
  const wrappedPromises = indexerPromises.map((item) => {
    pendingServices.add(item.name);
    return item.promise.finally(() => {
      pendingServices.delete(item.name);
      logger.debug({
        at: "Indexer#Main",
        message: `Service ${item.name} stopped successfully`,
      });
    });
  });

  // Log pending services every 20 seconds if we are stuck waiting
  const monitorInterval = setInterval(() => {
    if (pendingServices.size > 0) {
      logger.debug({
        at: "Indexer#Main",
        message: "Services currently running",
        pending: Array.from(pendingServices),
      });
    }
  }, 20000);

  const results = await Promise.allSettled(wrappedPromises);
  clearInterval(monitorInterval);

  results.forEach((result, index) => {
    const item = indexerPromises[index];
    if (!item) return;
    const { name } = item as { name: string };
    if (result.status === "rejected") {
      logger.error({
        at: "Indexer#Main",
        message: `${name} failed to run`,
        error: result.reason,
      });
    }
  });

  await redis?.quit();
  await postgres?.destroy();
  logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
  await new Promise<void>((resolve) => {
    logger.on("finish", resolve);
    logger.end();
  });
  process.exit(0);
}
