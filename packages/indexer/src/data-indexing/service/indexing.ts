import {
  IndexerConfig,
  startIndexing as startGenericIndexing,
} from "./genericIndexing";
import { utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";
import { CHAIN_PROTOCOLS, SupportedProtocols } from "./config";

/**
 * Definition of the request object for starting an indexer.
 *
 * @template TEventEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface StartIndexerRequest<
  TEventEntity,
  TDb,
  TPayload,
  TPreprocessed,
> {
  repo: TDb;
  rpcUrl: string;
  logger: Logger;
  /** Optional signal to gracefully shut down the indexer */
  sigterm?: AbortSignal;
  chainId: number;
  /** The list of protocols (groups of events) to support on this chain */
  protocols: SupportedProtocols<TEventEntity, TDb, TPayload, TPreprocessed>[];
}

export async function startChainIndexing<
  TEventEntity,
  TDb,
  TPayload,
  TPreprocessed,
>(request: StartIndexerRequest<TEventEntity, TDb, TPayload, TPreprocessed>) {
  const { repo, rpcUrl, logger, sigterm, chainId, protocols } = request;

  // Aggregate events from all supported protocols.
  // We pass the logger and chainId to each protocol so they can configure
  // their specific transforms, filters, and contract addresses.
  const events = protocols.flatMap((protocol) =>
    protocol.getEventHandlers(logger, chainId),
  );

  // Build the concrete configuration
  const indexerConfig: IndexerConfig<
    TEventEntity,
    TDb,
    TPayload,
    TPreprocessed
  > = {
    chainId,
    rpcUrl,
    events,
  };

  logger.info({
    at: "indexing#startChainIndexing",
    message: `Starting indexing for chain ${chainId}`,
    protocolCount: protocols.length,
    totalEvents: events.length,
  });

  // Start the generic indexer subsystem
  await startGenericIndexing({
    db: repo,
    indexerConfig,
    logger,
    sigterm,
  });
}

/**
 * Request object for the generic startIndexing entry point.
 */
export interface StartIndexersRequest {
  repo: dbUtils.BlockchainEventRepository;
  logger: Logger;
  /** Map of ChainID to list of RPC URLs */
  providers: Map<number, string[]>;
  sigterm?: AbortSignal;
  /** List of chains to start indexing for */
  chainIds: number[];
}

/**
 * Entry point to start all configured WebSocket indexers.
 * Iterates over provided chains, looks up their supported protocols, and starts them.
 * @returns A list of promises (handlers) for each started indexer.
 */
export function startWebSocketIndexing(
  request: StartIndexersRequest,
): Promise<void>[] {
  const { providers, logger, chainIds } = request;
  const handlers: Promise<void>[] = [];

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
    const protocols = CHAIN_PROTOCOLS[chainId];
    if (!protocols || protocols.length === 0) {
      logger.warn({
        at: "indexing#startIndexing",
        message: `No protocols configured for chainId ${chainId}`,
      });
      continue;
    }

    // Start Chain Indexing
    handlers.push(
      startChainIndexing({
        repo: request.repo,
        rpcUrl,
        logger: request.logger,
        sigterm: request.sigterm,
        chainId,
        protocols,
      }),
    );
  }

  return handlers;
}
