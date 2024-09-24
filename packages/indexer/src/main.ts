import assert from "assert";
import * as services from "./services";
import winston from "winston";
import Redis from "ioredis";
import * as across from "@across-protocol/sdk";
import { connectToDatabase } from "./database/database.provider";
import { DatabaseConfig } from "@repo/indexer-database";
import * as utils from "./utils";

type Config = {
  redisConfig: utils.RedisConfig;
  postgresConfig: DatabaseConfig;
  spokeConfigs: Omit<
    services.spokePoolIndexer.Config,
    "logger" | "redis" | "postgres"
  >[];
  hubConfig: Omit<
    services.hubPoolIndexer.Config,
    "logger" | "redis" | "postgres"
  >;
};

export function envToConfig(env: utils.Env): Config {
  assert(env.HUBPOOL_CHAIN, "Requires HUBPOOL_CHAIN");
  const redisConfig = utils.parseRedisConfig(env);
  const postgresConfig = utils.parsePostgresConfig(env);
  const allProviderConfigs = utils.parseProviderConfigs(env);
  const retryProviderConfig = utils.parseRetryProviderConfig(env);
  const hubPoolChain = utils.parseNumber(env.HUBPOOL_CHAIN);
  const spokePoolChainsEnabled = utils
    .parseArray(env.SPOKEPOOL_CHAINS_ENABLED)
    .map(utils.parseNumber);
  const providerConfigs = allProviderConfigs.filter(
    (provider) => provider[1] === hubPoolChain,
  );
  assert(
    allProviderConfigs.length > 0,
    `Requires at least one RPC_PROVIDER_URLS_CHAINID`,
  );

  const hubConfig = {
    retryProviderConfig: {
      ...retryProviderConfig,
      chainId: hubPoolChain,
      providerConfigs,
    },
    hubConfig: {
      chainId: hubPoolChain,
      maxBlockLookBack: 10000,
    },
    redisKeyPrefix: `hubPoolIndexer:${hubPoolChain}`,
  };

  const spokeConfigs = spokePoolChainsEnabled.map((chainId) => {
    const providerConfigs = allProviderConfigs.filter(
      (provider) => provider[1] == chainId,
    );
    assert(
      providerConfigs.length > 0,
      `SPOKEPOOL_CHAINS_ENABLED=${chainId} but did not find any corresponding RPC_PROVIDER_URLS_${chainId}`,
    );
    return {
      retryProviderConfig: {
        ...retryProviderConfig,
        chainId,
        providerConfigs,
      },
      spokeConfig: {
        chainId,
        maxBlockLookBack: 10000,
      },
      hubConfig: hubConfig.hubConfig,
      redisKeyPrefix: `spokePoolIndexer:${chainId}`,
    };
  });

  return {
    redisConfig,
    postgresConfig,
    hubConfig,
    spokeConfigs,
  };
}

async function initializeRedis(
  config: utils.RedisConfig,
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

export async function Main(config: Config, logger: winston.Logger) {
  const { redisConfig, postgresConfig, hubConfig, spokeConfigs } = config;

  const redis = await initializeRedis(redisConfig, logger);
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
