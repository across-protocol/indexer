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
import { startArbitrumIndexing } from "./data-indexing/service/indexing";

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

export async function MainSandbox(
  config: parseEnv.Config,
  logger: winston.Logger,
) {
  const { postgresConfig } = config;
  const postgres = await connectToDatabase(postgresConfig, logger);

  try {
    // Resolve Arbitrum RPC URL
    // The Config object doesn't hold RPCs directly, so we parse them from env
    // using the helper function defined in your parseEnv file.
    const allProviders = parseEnv.parseProvidersUrls();
    const arbitrumChainId = CHAIN_IDs.ARBITRUM; // 42161
    const arbProviders = allProviders.get(arbitrumChainId);

    if (!arbProviders || arbProviders.length === 0 || !arbProviders[0]) {
      throw new Error(
        `No RPC provider found for Arbitrum (Chain ID ${arbitrumChainId}). Please set RPC_PROVIDER_URLS_${arbitrumChainId} in .env`,
      );
    }
    const rpcUrl = arbProviders[0]; // Take the first available provider

    // Setup Repository
    const repo = new dbUtils.BlockchainEventRepository(postgres, logger);

    // Setup Shutdown Handling
    const abortController = new AbortController();

    const handleShutdown = (signal: string) => {
      logger.info({ message: `Received ${signal}. Shutting down sandbox...` });
      abortController.abort();
    };

    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));

    // Start the Indexer
    logger.info({
      at: "Indexer#Main",
      message: `Starting Indexer on chain ${arbitrumChainId}...`,
    });

    // This promise will resolve only when abortController.abort() is called
    // and the indexer has finished its cleanup routine.
    await startArbitrumIndexing({
      repo,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
    });

    logger.info({ at: "Indexer#Main", message: "Indexer finished execution." });
  } catch (error) {
    logger.error({
      message: "Fatal error in MainSandbox",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exitCode = 1;
  } finally {
    // Final Cleanup
    if (postgres.isInitialized) {
      logger.info({ message: "Closing database connection..." });
      await postgres.destroy();
    }
  }
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
      acrossIndexerManager.stopGracefully();
      cctpIndexerManager.stopGracefully();
      oftIndexerManager.stopGracefully();
      bundleServicesManager.stop();
      hotfixServicesManager.stop();
      cctpFinalizerServiceManager.stopGracefully();
    } else {
      integratorIdWorker.close();
      swapWorker.close();
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
  ] = await Promise.allSettled([
    bundleServicesManager.start(),
    acrossIndexerManager.start(),
    cctpIndexerManager.start(),
    oftIndexerManager.start(),
    hotfixServicesManager.start(),
    cctpFinalizerServiceManager.start(),
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
    },
  });
  await integratorIdWorker.close();
  redis?.quit();
  postgres?.destroy();
  logger.info({ at: "Indexer#Main", message: "Exiting indexer" });
}
