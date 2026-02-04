import {
  IndexerConfig,
  startIndexing as startGenericIndexing,
} from "./genericIndexing";
import { DataSource, utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";
import { getChainProtocols, SupportedProtocols } from "./config";
import { DataDogMetricsService } from "../../services/MetricsService";
import { WebSocketTransportConfig } from "viem";
import { Config } from "../../parseEnv";

/**
 * Definition of the request object for starting an indexer.
 *
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TTransformed The type of the transformed data.
 * @template TStored The type of the stored data.
 */
export interface StartIndexerRequest<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
> {
  database: DataSource;
  rpcUrl: string;
  logger: Logger;
  /** Optional signal to gracefully shut down the indexer */
  sigterm?: AbortSignal;
  chainId: number;
  /** The list of protocols (groups of events) to support on this chain */
  protocols: SupportedProtocols<
    TDb,
    TPayload,
    TPreprocessed,
    TTransformed,
    TStored
  >[];
  metrics?: DataDogMetricsService;
  /** Optional WebSocket transport options */
  transportOptions?: WebSocketTransportConfig;
}

export async function startChainIndexing<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
>(
  request: StartIndexerRequest<
    TDb,
    TPayload,
    TPreprocessed,
    TTransformed,
    TStored
  >,
) {
  const {
    database,
    rpcUrl,
    logger,
    sigterm,
    chainId,
    protocols,
    metrics,
    transportOptions,
  } = request;

  // Aggregate events from all supported protocols.
  // We pass the logger and chainId to each protocol so they can configure
  // their specific transforms, filters, and contract addresses.
  const events = protocols.flatMap((protocol) =>
    protocol.getEventHandlers({ logger, chainId, metrics }),
  );

  // Build the concrete configuration
  const indexerConfig: IndexerConfig<
    TDb,
    TPayload,
    TPreprocessed,
    TTransformed,
    TStored
  > = {
    chainId,
    rpcUrl,
    events,
    transportOptions,
  };

  logger.debug({
    at: "indexing#startChainIndexing",
    message: `Starting indexing for chain ${chainId}`,
    protocolCount: protocols.length,
    totalEvents: events.length,
  });

  // Start the generic indexer subsystem
  await startGenericIndexing({
    db: new dbUtils.BlockchainEventRepository(database, logger) as TDb,
    indexerConfig,
    logger,
    sigterm,
    metrics,
  });
}

/**
 * Request object for the generic startIndexing entry point.
 */
export interface StartIndexersRequest {
  database: DataSource;
  logger: Logger;
  /** Map of ChainID to list of RPC URLs */
  providers: Map<number, string[]>;
  sigterm?: AbortSignal;
  metrics?: DataDogMetricsService;
  config: Config;
}

/**
 * Entry point to start all configured WebSocket indexers.
 * Iterates over provided chains, looks up their supported protocols, and starts them.
 * @returns A list of promises (handlers) for each started indexer.
 */
export function startWebSocketIndexing(
  request: StartIndexersRequest,
): { chainId: number; promise: Promise<void> }[] {
  const { providers, logger, config, metrics } = request;
  const handlers: { chainId: number; promise: Promise<void> }[] = [];
  const chainProtocols = getChainProtocols(request.config);
  const chainIds = config.wsIndexerChainIds;

  for (const chainId of chainIds) {
    // Get RPC Provider
    const chainProviders = providers.get(chainId);
    if (!chainProviders || chainProviders.length === 0 || !chainProviders[0]) {
      logger.warn({
        at: "indexing#startIndexing",
        message: `No RPC provider found for chainId ${chainId}`,
      });
      continue;
    }
    const rpcUrl = chainProviders[0];

    // Get Supported Protocols
    const protocols = chainProtocols[chainId];
    if (!protocols || protocols.length === 0) {
      logger.warn({
        at: "indexing#startIndexing",
        message: `No protocols configured for chainId ${chainId}`,
      });
      continue;
    }

    // Start Chain Indexing
    handlers.push({
      chainId,
      promise: startChainIndexing({
        database: request.database,
        rpcUrl,
        logger: request.logger,
        sigterm: request.sigterm,
        chainId,
        protocols,
        metrics,
        transportOptions: {
          keepAlive: {
            interval: 10_000, // Default is 30,000. Change to 10,000 to be safe. GCP has a default keepAlive of 30 seconds, we need to be below that to avoid connection issues.
          },
          reconnect: {
            attempts: 20,
          },
          retryCount: 20,
          timeout: 30_000,
        },
      }),
    });
  }

  return handlers;
}
