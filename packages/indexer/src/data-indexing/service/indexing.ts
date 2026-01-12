import {
  IndexerConfig,
  startIndexing as startGenericIndexing,
} from "./genericIndexing";
import { CHAIN_IDs, TEST_NETWORKS } from "@across-protocol/constants";
import { IndexerEventPayload } from "./genericEventListening";
import { Entity } from "typeorm";
import {
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_SENT_EVENT_NAME,
  MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
  TOKEN_MESSENGER_ADDRESS_TESTNET,
  MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
  MESSAGE_RECEIVED_EVENT_NAME,
} from "./constants";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_SENT_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
} from "../model/abis";
import {
  transformDepositForBurnEvent,
  transformMessageSentEvent,
  transformMessageReceivedEvent,
} from "./tranforming";
import { extractRawArgs } from "./preprocessing";
import {
  storeDepositForBurnEvent,
  storeMessageSentEvent,
  storeMessageReceivedEvent,
} from "./storing";
import { utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";
import {
  filterDepositForBurnEvents,
  createCctpBurnFilter,
  filterMessageReceived,
} from "./filtering";
import {
  EventArgs,
  DepositForBurnArgs,
  MessageSentArgs,
  MessageReceivedArgs,
} from "../model/eventTypes";
import { getChainProtocols, SupportedProtocols } from "./config";
import { DataDogMetricsService } from "../../services/MetricsService";
import { WebSocketTransportConfig } from "viem";
import { Config } from "../../parseEnv";

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
  metrics?: DataDogMetricsService;
  /** Optional WebSocket transport options */
  transportOptions?: WebSocketTransportConfig;
}

export async function startChainIndexing<
  TEventEntity,
  TDb,
  TPayload,
  TPreprocessed,
>(request: StartIndexerRequest<TEventEntity, TDb, TPayload, TPreprocessed>) {
  const {
    repo,
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
    transportOptions,
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
    metrics,
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
): Promise<void>[] {
  const { providers, logger, chainIds, metrics } = request;
  const handlers: Promise<void>[] = [];
  const chainProtocols = getChainProtocols(request.config);

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
    handlers.push(
      startChainIndexing({
        repo: request.repo,
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
            attempts: 100, // Default is 5
          },
          retryCount: 100, // Default is 5
          timeout: 30_000,
        },
      }),
    );
  }

  return handlers;
}
