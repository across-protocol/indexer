import * as s from "superstruct";
import { utils } from "@across-protocol/sdk";
import { assert } from "@repo/error-handling";
import { DatabaseConfig } from "@repo/indexer-database";
import {
  Config as WebhooksConfig,
  WebhookTypes,
  parseWebhookClientsFromString,
} from "@repo/webhooks";
import { getNoTtlBlockDistance } from "./web3/constants";

export type Config = {
  redisConfig: RedisConfig;
  postgresConfig: DatabaseConfig;
  hubChainId: number;
  evmSpokePoolChainsEnabled: number[];
  svmSpokePoolChainsEnabled: number[];
  enableHubPoolIndexer: boolean;
  enableBundleIncludedEventsService: boolean;
  enableHotfixServices: boolean;
  enableBundleBuilder: boolean;
  webhookConfig: WebhooksConfig;
  maxBlockRangeSize?: number;
  coingeckoApiKey?: string;
  enablePriceWorker: boolean;
  bundleEventsServiceStartBlockNumber: number;
  /**
   * Override the delay between processing block ranges in seconds in the Indexer class.
   * If this is not set, then the default hardcoded values will be used.
   */
  indexingDelaySeconds?: number;
  /**
   * Override the delay between runs in seconds for the BundleIncludedEventsService.
   * If this is not set, defaults to the hardcoded value.
   */
  bundleEventsServiceDelaySeconds?: number;
};

export type RedisConfig = {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
};

export type ProviderConfig = [providerUrl: string, chainId: number];

export type RetryProviderConfig = {
  providerCacheNamespace: string;
  providerCacheTtl?: number;
  maxConcurrency: number;
  pctRpcCallsLogged: number;
  standardTtlBlockDistance?: number;
  noTtlBlockDistance: number;
  nodeQuorumThreshold: number;
  timeout: number;
  retries: number;
  retryDelay: number;
};

export type Env = Record<string, string | undefined>;

export function parseRedisConfig(env: Env): RedisConfig {
  const { REDIS_HOST, REDIS_PORT } = env;
  assert(REDIS_HOST, "requires REDIS_HOST");
  assert(REDIS_PORT, "requires REDIS_PORT");
  const port = parseNumber(REDIS_PORT);
  return {
    host: REDIS_HOST,
    port,
    // @dev: this retry config is needed for bullmq workers
    maxRetriesPerRequest: null,
  };
}

function parseArray(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length);
}

// superstruct coersion to turn string into an int and validate
const stringToInt = s.coerce(s.number(), s.string(), (value) =>
  parseInt(value),
);
function parseNumber(value: string): number {
  return s.create(value, stringToInt);
}

export function parsePostgresConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig {
  assert(env.DATABASE_HOST, "requires DATABASE_HOST");
  assert(env.DATABASE_PORT, "requires DATABASE_PORT");
  assert(env.DATABASE_USER, "requires DATABASE_USER");
  assert(env.DATABASE_PASSWORD, "requires DATABASE_PASSWORD");
  assert(env.DATABASE_NAME, "requires DATABASE_NAME");
  return {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    dbName: env.DATABASE_NAME,
  };
}

function parseProviderConfigs(env: Env): ProviderConfig[] {
  const results: ProviderConfig[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^RPC_PROVIDER_URLS_(\d+)$/);
    if (match) {
      const chainId = match[1] ? parseNumber(match[1]) : undefined;
      if (chainId && value) {
        const providerUrls = parseArray(value);
        providerUrls.forEach((url) => {
          results.push([url, chainId]);
        });
      }
    }
  }
  return results;
}

export function parseProvidersUrls() {
  const results: Map<number, string[]> = new Map();
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^RPC_PROVIDER_URLS_(\d+)$/);
    if (match) {
      const chainId = match[1] ? parseNumber(match[1]) : undefined;
      if (chainId && value) {
        const providerUrls = parseArray(value);
        results.set(chainId, providerUrls);
      }
    }
  }
  return results;
}

export function parseRetryProviderEnvs(chainId: number): RetryProviderConfig {
  const providerCacheNamespace =
    process.env.PROVIDER_CACHE_NAMESPACE || "indexer_provider_cache";
  const providerCacheTtl = process.env.PROVIDER_CACHE_TTL
    ? Number(process.env.PROVIDER_CACHE_TTL)
    : undefined;
  const maxConcurrency = Number(
    process.env[`NODE_MAX_CONCURRENCY_${chainId}`] ||
      process.env.NODE_MAX_CONCURRENCY ||
      "25",
  );
  const pctRpcCallsLogged = Number(
    process.env[`NODE_PCT_RPC_CALLS_LOGGED_${chainId}`] ||
      process.env.NODE_PCT_RPC_CALLS_LOGGED ||
      "0",
  );
  const nodeQuorumThreshold = Number(
    process.env[`NODE_QUORUM_${chainId}`] || process.env.NODE_QUORUM || "1",
  );
  const timeout = Number(
    process.env[`NODE_TIMEOUT_${chainId}`] ||
      process.env.NODE_TIMEOUT ||
      "60000", // 60 seconds
  );
  const retries = Number(
    process.env[`NODE_RETRIES_${chainId}`] || process.env.NODE_RETRIES || "0",
  );
  const retryDelay = Number(
    process.env[`NODE_RETRY_DELAY_${chainId}`] ||
      process.env.NODE_RETRY_DELAY ||
      "1",
  );
  // Note: if there is no env var override _and_ no default, this will remain undefined and
  // effectively disable indefinite caching of old blocks/keys.
  const noTtlBlockDistance: number | undefined = process.env[
    `NO_TTL_BLOCK_DISTANCE_${chainId}`
  ]
    ? Number(process.env[`NO_TTL_BLOCK_DISTANCE_${chainId}`])
    : getNoTtlBlockDistance(chainId);

  return {
    providerCacheNamespace,
    providerCacheTtl,
    maxConcurrency,
    pctRpcCallsLogged,
    nodeQuorumThreshold,
    timeout,
    retries,
    retryDelay,
    noTtlBlockDistance,
  };
}

export function envToConfig(env: Env): Config {
  assert(env.HUBPOOL_CHAIN, "Requires HUBPOOL_CHAIN");
  const redisConfig = parseRedisConfig(env);
  const postgresConfig = parsePostgresConfig(env);
  const allProviderConfigs = parseProviderConfigs(env);
  const hubPoolChain = parseNumber(env.HUBPOOL_CHAIN);
  const spokePoolChainsEnabled = parseArray(env.SPOKEPOOL_CHAINS_ENABLED).map(
    parseNumber,
  );
  assert(
    allProviderConfigs.length > 0,
    `Requires at least one RPC_PROVIDER_URLS_CHAIN_ID`,
  );
  const evmSpokePoolChainsEnabled = spokePoolChainsEnabled.filter((chainId) =>
    utils.chainIsEvm(chainId),
  );
  const svmSpokePoolChainsEnabled = spokePoolChainsEnabled.filter((chainId) =>
    utils.chainIsSvm(chainId),
  );
  const hubChainId = hubPoolChain;
  const enableHubPoolIndexer = env.ENABLE_HUBPOOL_INDEXER
    ? env.ENABLE_HUBPOOL_INDEXER === "true"
    : true;
  const enableBundleIncludedEventsService =
    env.ENABLE_BUNDLE_INCLUDED_EVENTS_SERVICE
      ? env.ENABLE_BUNDLE_INCLUDED_EVENTS_SERVICE === "true"
      : true;
  const enableHotfixServices = env.ENABLE_HOTFIX_SERVICES
    ? env.ENABLE_HOTFIX_SERVICES === "true"
    : false;
  const enableBundleBuilder = env.ENABLE_BUNDLE_BUILDER
    ? env.ENABLE_BUNDLE_BUILDER === "true"
    : true;
  const enablePriceWorker = env.ENABLE_PRICE_WORKER
    ? env.ENABLE_PRICE_WORKER === "true"
    : true;
  const maxBlockRangeSize = env.MAX_BLOCK_RANGE_SIZE
    ? parseInt(env.MAX_BLOCK_RANGE_SIZE)
    : undefined;
  spokePoolChainsEnabled.forEach((chainId) => {
    const providerConfigs = allProviderConfigs.filter(
      (provider) => provider[1] == chainId,
    );
    assert(
      providerConfigs.length > 0,
      `SPOKEPOOL_CHAINS_ENABLED=${chainId} but did not find any corresponding RPC_PROVIDER_URLS_${chainId}`,
    );
  });
  const webhookConfig = {
    enabledWebhooks: [WebhookTypes.DepositStatus],
    enabledWebhookRequestWorkers: true,
    clients: parseWebhookClientsFromString(env.WEBHOOK_CLIENTS ?? "[]"),
  };
  const coingeckoApiKey = env.COINGECKO_API_KEY;
  const bundleEventsServiceStartBlockNumber =
    env.BUNDLE_EVENTS_SERVICE_START_BLOCK_NUMBER
      ? parseInt(env.BUNDLE_EVENTS_SERVICE_START_BLOCK_NUMBER)
      : // Across v3 mainnet deployment block
        19277710;

  const indexingDelaySeconds = env.INDEXING_DELAY_SECONDS
    ? parseInt(env.INDEXING_DELAY_SECONDS)
    : undefined;

  const bundleIncludedEventsServiceDelaySeconds =
    env.BUNDLE_EVENTS_SERVICE_DELAY_SECONDS
      ? parseInt(env.BUNDLE_EVENTS_SERVICE_DELAY_SECONDS)
      : 30;

  return {
    redisConfig,
    postgresConfig,
    hubChainId,
    evmSpokePoolChainsEnabled,
    svmSpokePoolChainsEnabled,
    enableHubPoolIndexer,
    enableBundleIncludedEventsService,
    enableHotfixServices,
    enableBundleBuilder,
    webhookConfig,
    maxBlockRangeSize,
    coingeckoApiKey,
    enablePriceWorker,
    bundleEventsServiceStartBlockNumber,
    indexingDelaySeconds,
    bundleEventsServiceDelaySeconds: bundleIncludedEventsServiceDelaySeconds,
  };
}
