import { Logger } from "winston";
import { PUBLIC_NETWORKS } from "@across-protocol/constants";
import { providers, utils } from "@across-protocol/sdk";

import {
  parseRetryProviderEnvs,
  parseProvidersUrls,
  RetryProviderConfig,
} from "../parseEnv";
import { RedisCache } from "../redis/redisCache";
import { getChainCacheFollowDistance } from "./constants";

// SVM provider helper type.
// TODO: move to SDK.
export type SvmProvider = ReturnType<
  typeof providers.CachedSolanaRpcFactory.prototype.createRpcClient
>;

export class RetryProvidersFactory {
  private retryProviders: Map<number, SvmProvider | providers.RetryProvider> =
    new Map();

  constructor(
    private redisCache: RedisCache,
    private logger: Logger,
  ) {}

  public initializeProviders(): RetryProvidersFactory {
    const providersUrls = parseProvidersUrls();

    for (const [chainId, providerUrls] of providersUrls.entries()) {
      const retryProviderEnvs = parseRetryProviderEnvs(chainId);
      if (!providerUrls || providerUrls.length === 0) {
        throw new Error(`Invalid provider urls found for chainId: ${chainId}`);
      }
      const standardTtlBlockDistance = getChainCacheFollowDistance(chainId);
      let provider;
      if (utils.chainIsSvm(chainId)) {
        provider = this.instantiateSvmProvider(
          chainId,
          retryProviderEnvs,
          providerUrls,
        );
      } else if (utils.chainIsEvm(chainId)) {
        provider = this.instantiateEvmProvider(
          chainId,
          { ...retryProviderEnvs, standardTtlBlockDistance },
          providerUrls,
        );
      } else {
        const chainFamily = PUBLIC_NETWORKS[chainId]?.family;
        throw new Error(
          `Invalid chainId ${chainId}. Chain family ${chainFamily} not supported.`,
        );
      }

      this.retryProviders.set(chainId, provider);
    }
    return this;
  }

  private instantiateSvmProvider(
    chainId: number,
    providerEnvs: RetryProviderConfig,
    providerUrls: string[],
  ): SvmProvider {
    const rpcFactory = new providers.CachedSolanaRpcFactory(
      providerEnvs.providerCacheNamespace,
      this.redisCache,
      providerEnvs.maxConcurrency,
      providerEnvs.pctRpcCallsLogged,
      this.logger,
      providerUrls[0]!,
      chainId,
    );
    return rpcFactory.createRpcClient();
  }

  private instantiateEvmProvider(
    chainId: number,
    providerEnvs: RetryProviderConfig,
    providerUrls: string[],
  ): providers.RetryProvider {
    return new providers.RetryProvider(
      providerUrls.map((url) => [url, chainId]),
      chainId,
      providerEnvs.nodeQuorumThreshold,
      providerEnvs.retries,
      providerEnvs.retryDelay,
      providerEnvs.maxConcurrency,
      providerEnvs.providerCacheNamespace,
      providerEnvs.pctRpcCallsLogged,
      this.redisCache,
      providerEnvs.standardTtlBlockDistance,
      providerEnvs.noTtlBlockDistance,
      providerEnvs.providerCacheTtl,
      this.logger,
    );
  }

  public getProviderForChainId(
    chainId: number,
  ): SvmProvider | providers.RetryProvider {
    const retryProvider = this.retryProviders.get(chainId);

    if (!retryProvider) {
      throw new Error(`No retry provider found for chainId: ${chainId}`);
    }

    return retryProvider;
  }

  // TODO: This will need to be updated to support custom SVM providers too.
  /**
   * Get a custom EVM provider for a given chainId. This is useful for testing
   * for situations where you need a provider with different settings than the
   * default ones.
   */
  public getCustomEvmProvider({
    chainId,
    enableCaching = true,
  }: {
    chainId: number;
    enableCaching: boolean;
  }): providers.RetryProvider {
    const providerUrls = parseProvidersUrls().get(chainId);

    if (!providerUrls || providerUrls.length === 0) {
      throw new Error(`No provider urls found for chainId: ${chainId}`);
    }
    const retryProviderEnvs = parseRetryProviderEnvs(chainId);

    let redisCache;
    let standardTtlBlockDistance;
    let noTtlBlockDistance;
    let providerCacheTtl;

    // Caching is enabled by overriding the undefined values
    if (enableCaching) {
      redisCache = this.redisCache;
      standardTtlBlockDistance = getChainCacheFollowDistance(chainId);
      noTtlBlockDistance = retryProviderEnvs.noTtlBlockDistance;
      providerCacheTtl = retryProviderEnvs.providerCacheTtl;
    }

    return new providers.RetryProvider(
      providerUrls.map((url) => [url, chainId]),
      chainId,
      retryProviderEnvs.nodeQuorumThreshold,
      retryProviderEnvs.retries,
      retryProviderEnvs.retryDelay,
      retryProviderEnvs.maxConcurrency,
      retryProviderEnvs.providerCacheNamespace,
      retryProviderEnvs.pctRpcCallsLogged,
      redisCache,
      standardTtlBlockDistance,
      noTtlBlockDistance,
      providerCacheTtl,
      this.logger,
    );
  }
}
