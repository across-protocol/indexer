import { Logger } from "winston";
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
      } else {
        // explicitly check for evm
        provider = this.instantiateEvmProvider(
          chainId,
          { ...retryProviderEnvs, standardTtlBlockDistance },
          providerUrls,
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
}
