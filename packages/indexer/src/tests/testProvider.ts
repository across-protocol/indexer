import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { Logger } from "winston";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

import { RedisCache } from "../redis/redisCache";
import { RetryProviderConfig } from "../parseEnv";

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
