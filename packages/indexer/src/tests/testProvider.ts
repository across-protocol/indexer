import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { Logger } from "winston";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { RedisCache } from "../redis/redisCache";

/**
 * Creates a test instance of a RetryProvider.
 *
 * This function simplifies the creation of a `RetryProvider` for testing purposes.
 * It sets up a `RetryProvidersFactory` with a dummy Redis cache and a provided logger,
 * then returns a new provider instance for the specified chain ID with caching disabled.
 * This is useful for isolating provider-dependent logic in tests without needing a full
 * Redis instance or complex configuration.
 *
 * @param chainId The chain ID for which to create the provider.
 * @param logger A logger instance for the provider to use.
 * @returns An instance of `across.providers.RetryProvider` configured for testing.
 */
export function createTestRetryProvider(
  chainId: number,
  logger: Logger,
): across.providers.RetryProvider {
  const dummyRedis = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve("OK"),
    publish: () => Promise.resolve(1),
    subscribe: () => Promise.resolve(),
    on: () => {},
  } as unknown as Redis;
  const redisCache = new RedisCache(dummyRedis);
  const retryProvidersFactory = new RetryProvidersFactory(redisCache, logger);
  return retryProvidersFactory.getCustomEvmProvider({
    chainId,
    enableCaching: false,
  }) as across.providers.RetryProvider;
}
