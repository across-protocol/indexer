import assert from "assert";
import * as s from "superstruct";
import { DatabaseConfig } from "@repo/indexer-database";
import * as services from "./services";
import { DEFAULT_NO_TTL_DISTANCE } from "./web3/constants";
import { RetryProviderConfig } from "./utils";

export type Config = {
  redisConfig: RedisConfig;
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
export type RedisConfig = {
  host: string;
  port: number;
};
export type ProviderConfig = [providerUrl: string, chainId: number];

export type Env = Record<string, string | undefined>;

function parseRedisConfig(env: Env): RedisConfig {
  assert(env.REDIS_HOST, "requires REDIS_HOST");
  assert(env.REDIS_PORT, "requires REDIS_PORT");
  const port = parseNumber(env.REDIS_PORT);
  return {
    host: env.REDIS_HOST,
    port,
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

function parsePostgresConfig(
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

function parseRetryProviderConfig(
  env: Record<string, string | undefined>,
): Omit<RetryProviderConfig, "providerConfigs" | "chainId"> {
  assert(env.PROVIDER_CACHE_NAMESPACE, "requires PROVIDER_CACHE_NAMESPACE");
  assert(env.MAX_CONCURRENCY, "requires MAX_CONCURRENCY");
  assert(env.PCT_RPC_CALLS_LOGGED, "requires PCT_RPC_CALLS_LOGGED");
  assert(
    env.STANDARD_TTL_BLOCK_DISTANCE,
    "requires STANDARD_TTL_BLOCK_DISTANCE",
  );
  assert(env.NO_TTL_BLOCK_DISTANCE, "requires NO_TTL_BLOCK_DISTANCE");
  assert(env.PROVIDER_CACHE_TTL, "requires PROVIDER_CACHE_TTL");
  assert(env.NODE_QUORUM_THRESHOLD, "requires NODE_QUORUM_THRESHOLD");
  assert(env.RETRIES, "requires RETRIES");
  assert(env.DELAY, "requires DELAY");

  return {
    providerCacheNamespace: env.PROVIDER_CACHE_NAMESPACE,
    maxConcurrency: s.create(env.MAX_CONCURRENCY, stringToInt),
    pctRpcCallsLogged: s.create(env.PCT_RPC_CALLS_LOGGED, stringToInt),
    standardTtlBlockDistance: s.create(
      env.STANDARD_TTL_BLOCK_DISTANCE,
      stringToInt,
    ),
    noTtlBlockDistance: s.create(env.NO_TTL_BLOCK_DISTANCE, stringToInt),
    providerCacheTtl: s.create(env.PROVIDER_CACHE_TTL, stringToInt),
    nodeQuorumThreshold: s.create(env.NODE_QUORUM_THRESHOLD, stringToInt),
    retries: s.create(env.RETRIES, stringToInt),
    delay: s.create(env.DELAY, stringToInt),
  };
}

export function parseProvidersUrls() {
  const results: Record<number, string[]> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^RPC_PROVIDER_URLS_(\d+)$/);
    if (match) {
      const chainId = match[1] ? parseNumber(match[1]) : undefined;
      if (chainId && value) {
        const providerUrls = parseArray(value);
        results[chainId] = providerUrls;
      }
    }
  }
  return results;
}

export function parseRetryProviderEnvs(chainId: number) {
  const providerCacheNamespace =
    process.env.PROVIDER_CACHE_NAMESPACE || "indexer_provider_cache";
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
  const providerCacheTtl = process.env.PROVIDER_CACHE_TTL
    ? Number(process.env.PROVIDER_CACHE_TTL)
    : undefined;
  const nodeQuorumThreshold = Number(
    process.env[`NODE_QUORUM_${chainId}`] || process.env.NODE_QUORUM || "1",
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
    : DEFAULT_NO_TTL_DISTANCE[chainId];

  return {
    providerCacheNamespace,
    maxConcurrency,
    pctRpcCallsLogged,
    providerCacheTtl,
    nodeQuorumThreshold,
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
  const retryProviderConfig = parseRetryProviderConfig(env);
  const hubPoolChain = parseNumber(env.HUBPOOL_CHAIN);
  const spokePoolChainsEnabled = parseArray(env.SPOKEPOOL_CHAINS_ENABLED).map(
    parseNumber,
  );
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
