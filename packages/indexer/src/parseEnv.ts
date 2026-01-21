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
import * as os from "os";

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
  cctpIndexerChainIds: number[];
  enableCctpFinalizer: boolean;
  pubSubCctpFinalizerTopic: string;
  pubSubGcpProjectId: string;
  enableOftIndexer: boolean;
  enableHyperliquidIndexer: boolean;
  datadogConfig: DatadogConfig;
  webhookConfig: WebhooksConfig;
  maxBlockRangeSize?: number;
  coingeckoApiKey?: string;
  enablePriceWorker: boolean;
  enabledMonitors: string[];
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
  /**
   * Override the delay between processing block ranges in seconds in the Indexer class when an error occurs.
   * If this is not set, then the default hardcoded values will be used.
   */
  indexingDelaySecondsOnError?: number;
  /**
   * The list of chain IDs for which the WebSocket indexing is enabled.
   */
  wsIndexerChainIds: number[];
  enableWebSocketIndexer: boolean;
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

export type DatadogConfig = {
  enabled: boolean;
  environment: string;
  dd_api_key: string;
  dd_app_key: string;
  globalTags: string[];
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

export function parseProvidersUrls(prefix: string = "RPC_PROVIDER_URLS_") {
  const results: Map<number, string[]> = new Map();
  const regex = new RegExp(`^${prefix}(\\d+)$`);

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(regex);
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

export function parseDatadogConfig(env: Env): DatadogConfig {
  let enabled = env.DD_ENABLED === "true";
  const environment = env.DD_ENVIRONMENT || "local";
  const dd_api_key = env.DD_API_KEY || "";
  const dd_app_key = env.DD_APP_KEY || "";

  const tags = [`env:${environment}`];

  if (environment === "local") {
    // Attempt to get machine name from env or os.hostname
    // This is done so that if we run the indexer locally, we do not mix up metrics from different machines
    let username;
    try {
      username = os.userInfo().username;
    } catch (error) {
      // Fallback for environments where userInfo() fails
      // Let the usern set their own name if they want to
      username = process.env.USERNAME || "unknown-user";
    }
    const machineName = env.MACHINE_NAME || os.hostname();
    const name = username + "@" + machineName;
    tags.push(`userIdentity:${name}`);
  }
  // If dd_api_key or dd_app_key is empty, disable datadog
  if (dd_api_key.length === 0 || dd_app_key.length === 0) {
    enabled = false;
  }

  return {
    enabled,
    environment,
    dd_api_key,
    dd_app_key,
    globalTags: tags,
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
  const cctpIndexerChainIds = parseArray(env.CCTP_INDEXER_CHAIN_IDS).map(
    parseNumber,
  );
  const enableOftIndexer = env.ENABLE_OFT_INDEXER
    ? env.ENABLE_OFT_INDEXER === "true"
    : false;
  const enableHyperliquidIndexer = env.ENABLE_HYPERLIQUID_INDEXER
    ? env.ENABLE_HYPERLIQUID_INDEXER === "true"
    : false;
  const enableCctpFinalizer = env.ENABLE_CCTP_FINALIZER
    ? env.ENABLE_CCTP_FINALIZER === "true"
    : false;
  const pubSubCctpFinalizerTopic = env.PUBSUB_CCTP_FINALIZER_TOPIC ?? "";
  const pubSubGcpProjectId = env.PUBSUB_GCP_PROJECT_ID ?? "";
  const datadogConfig = parseDatadogConfig(env);
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
  const enabledMonitors = parseArray(env.ENABLED_MONITORS);
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
  const enableWebSocketIndexer = env.ENABLE_WEBSOCKET_INDEXER === "true";

  let wsIndexerChainIds: number[] = [];
  if (process.env.WS_INDEXER_CHAIN_IDS) {
    wsIndexerChainIds = process.env.WS_INDEXER_CHAIN_IDS.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

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
    cctpIndexerChainIds,
    enableOftIndexer,
    enableHyperliquidIndexer,
    enableCctpFinalizer,
    pubSubCctpFinalizerTopic,
    pubSubGcpProjectId,
    datadogConfig,
    webhookConfig,
    maxBlockRangeSize,
    coingeckoApiKey,
    enablePriceWorker,
    enabledMonitors,
    bundleEventsServiceStartBlockNumber,
    indexingDelaySeconds,
    bundleEventsServiceDelaySeconds: bundleIncludedEventsServiceDelaySeconds,
    wsIndexerChainIds,
    enableWebSocketIndexer,
  };
}
