import { PUBLIC_NETWORKS } from "@across-protocol/constants";
import { arch, providers, utils } from "@across-protocol/sdk";
import { ethers } from "ethers";
import { Logger } from "winston";
import {
  parseProvidersUrls,
  parseRetryProviderEnvs,
  RetryProviderConfig,
} from "../parseEnv";
import { RedisCache } from "../redis/redisCache";
import { getChainCacheFollowDistance } from "./constants";

// SVM provider helper type.
export type SvmProvider = arch.svm.SVMProvider;

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
      providerEnvs.retries,
      providerEnvs.retryDelay,
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
    const connectionInfo = this.getConnectionInfo(
      providerUrls,
      chainId,
      providerEnvs,
    );

    return new providers.RetryProvider(
      connectionInfo,
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
    if (!utils.chainIsEvm(chainId)) {
      throw new Error(`Chain ${chainId} is not an EVM chain`);
    }

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

    const connectionInfo = this.getConnectionInfo(
      providerUrls,
      chainId,
      retryProviderEnvs,
    );

    return new providers.RetryProvider(
      connectionInfo,
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

  private createRpcRateLimitedCallback(retries: number) {
    const logEveryNRateLimitErrors = 100;
    let rateLimitLogCounter = 0;

    return ({
        nodeMaxConcurrency,
        logger,
      }: {
        nodeMaxConcurrency: number;
        logger: Logger;
      }) =>
      async (attempt: number, url: string): Promise<boolean> => {
        const baseDelay = 1000 * Math.pow(2, attempt);
        const delayMs = baseDelay + baseDelay * Math.random();

        if (logger && rateLimitLogCounter++ % logEveryNRateLimitErrors === 0) {
          logger.debug({
            at: "ProviderUtils#rpcRateLimited",
            message: `Got rate-limit (429) response on attempt ${attempt}.`,
            rpc: url,
            retryAfter: `${delayMs} ms`,
            workers: nodeMaxConcurrency,
          });
        }
        await utils.delay(delayMs);

        return attempt < retries;
      };
  }

  private getConnectionInfo(
    providerUrls: string[],
    chainId: number,
    retryProviderEnvs: RetryProviderConfig,
  ): [ethers.utils.ConnectionInfo, number][] {
    const rpcRateLimited = this.createRpcRateLimitedCallback(
      retryProviderEnvs.retries,
    );

    return providerUrls.map((url): [ethers.utils.ConnectionInfo, number] => {
      const config = {
        url,
        timeout: retryProviderEnvs.timeout,
        allowGzip: true,
        throttleSlotInterval: 1,
        throttleCallback: rpcRateLimited({
          nodeMaxConcurrency: retryProviderEnvs.maxConcurrency,
          logger: this.logger,
        }),
        errorPassThrough: true,
      };

      return [config, chainId];
    });
  }
}
