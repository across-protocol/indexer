import { Logger } from "winston";
import { providers } from "@across-protocol/sdk";

import { parseRetryProviderEnvs, parseProvidersUrls } from "../parseEnv";
import { RedisCache } from "../redis/redisCache";
import { CHAIN_CACHE_FOLLOW_DISTANCE } from "./constants";

export class RetryProvidersFactory {
  private retryProviders: Map<number, providers.RetryProvider> = new Map();

  constructor(
    private redisCache: RedisCache,
    private logger: Logger,
  ) {}

  public initializeProviders() {
    const providersUrls = parseProvidersUrls();

    for (const chainId of this.retryProviders.keys()) {
      const retryProviderEnvs = parseRetryProviderEnvs(chainId);
      const providerUrls = providersUrls[chainId];
      if (!providerUrls || providerUrls.length === 0) {
        throw new Error(`No provider urls found for chainId: ${chainId}`);
      }
      const standardTtlBlockDistance =
        CHAIN_CACHE_FOLLOW_DISTANCE[chainId] || 0;
      const provider = new providers.RetryProvider(
        providerUrls.map((url) => [url, chainId]),
        chainId,
        retryProviderEnvs.nodeQuorumThreshold,
        retryProviderEnvs.retries,
        retryProviderEnvs.retryDelay,
        retryProviderEnvs.maxConcurrency,
        retryProviderEnvs.providerCacheNamespace,
        retryProviderEnvs.pctRpcCallsLogged,
        this.redisCache,
        standardTtlBlockDistance,
        retryProviderEnvs.noTtlBlockDistance,
        retryProviderEnvs.providerCacheTtl,
        this.logger,
      );
      this.retryProviders.set(chainId, provider);
    }
  }

  public getProviderForChainId(chainId: number) {
    const retryProvider = this.retryProviders.get(chainId);

    if (!retryProvider) {
      throw new Error(`No retry provider found for chainId: ${chainId}`);
    }

    return retryProvider;
  }
}
