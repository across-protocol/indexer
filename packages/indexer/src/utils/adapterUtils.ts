import { Logger } from "winston";
import { providers } from "@across-protocol/sdk";
import { DataDogMetricsService, withMetrics } from "../services/MetricsService";
import { COUNT } from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";
import { RedisCache } from "../redis/redisCache";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

/**
 * Creates a RetryProvidersFactory with metrics wrapper on the provider's send method.
 * @param cache The redis cache instance.
 * @param logger The logger instance.
 * @param metrics The metrics service instance.
 * @returns The initialized RetryProvidersFactory.
 */
export function createRetryProvidersFactoryWithMetrics(
  cache: RedisCache,
  logger: Logger,
  metrics?: DataDogMetricsService,
): RetryProvidersFactory {
  const retryProvidersFactory = new RetryProvidersFactory(
    cache,
    logger,
  ).initializeProviders();

  if (!metrics) {
    return retryProvidersFactory;
  }

  // Wrap the provider's send method with metrics
  const originalGetProviderForChainId =
    retryProvidersFactory.getProviderForChainId.bind(retryProvidersFactory);
  retryProvidersFactory.getProviderForChainId = (chainId: number) => {
    const provider = originalGetProviderForChainId(chainId);
    // Check if provider has a send method (RetryProvider) and cast to any to allow modification
    if ("send" in provider && typeof (provider as any).send === "function") {
      const retryProvider = provider as providers.RetryProvider;
      const originalSend = retryProvider.send.bind(retryProvider);
      retryProvider.send = withMetrics(originalSend, {
        service: metrics,
        metricName: "SpokePoolProtocolRpcRequests",
        tags: [`chainId:${chainId}`, `spokePoolProtocol`],
        type: COUNT,
        logger,
      });
    }
    return provider;
  };
  return retryProvidersFactory;
}
