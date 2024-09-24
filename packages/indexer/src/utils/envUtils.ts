import assert from "assert";
import { DatabaseConfig } from "@repo/indexer-database";
import * as s from "superstruct";
import { RetryProviderConfig } from "./contractUtils";
export type RedisConfig = {
  host: string;
  port: number;
};
export type ProviderConfig = [providerUrl: string, chainId: number];

export type Env = Record<string, string | undefined>;

export function parseRedisConfig(env: Env): RedisConfig {
  assert(env.REDIS_HOST, "requires REDIS_HOST");
  assert(env.REDIS_PORT, "requires REDIS_PORT");
  const port = parseNumber(env.REDIS_PORT);
  return {
    host: env.REDIS_HOST,
    port,
  };
}

export function parseArray(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length);
}

// superstruct coersion to turn string into an int and validate
export const stringToInt = s.coerce(s.number(), s.string(), (value) =>
  parseInt(value),
);
export function parseNumber(value: string): number {
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
export function parseProviderConfigs(env: Env): ProviderConfig[] {
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

export function parseRetryProviderConfig(
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
