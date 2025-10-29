import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { Logger } from "winston";

import { RedisCache } from "../redis/redisCache";
import { RetryProviderConfig } from "../parseEnv";

export function createTestRetryProvider(
  rpcUrl: string,
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

  const retryProviderConfig: RetryProviderConfig = {
    providerCacheNamespace: "test_namespace",
    maxConcurrency: 1,
    pctRpcCallsLogged: 0,
    nodeQuorumThreshold: 1,
    timeout: 60000,
    retries: 0,
    retryDelay: 1,
    noTtlBlockDistance: 0,
  };

  const connectionInfo: [ethers.utils.ConnectionInfo, number][] = [
    [
      {
        url: rpcUrl,
        timeout: retryProviderConfig.timeout,
        allowGzip: true,
        throttleSlotInterval: 1,
        throttleCallback: async (attempt: number, url: string) => false, // Dummy throttleCallback
        errorPassThrough: true,
      },
      chainId,
    ],
  ];

  return new across.providers.RetryProvider(
    connectionInfo,
    chainId,
    retryProviderConfig.nodeQuorumThreshold,
    retryProviderConfig.retries,
    retryProviderConfig.retryDelay,
    retryProviderConfig.maxConcurrency,
    retryProviderConfig.providerCacheNamespace,
    retryProviderConfig.pctRpcCallsLogged,
    redisCache,
    undefined, // standardTtlBlockDistance
    retryProviderConfig.noTtlBlockDistance,
    undefined, // providerCacheTtl
    logger,
  );
}
