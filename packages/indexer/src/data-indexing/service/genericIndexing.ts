import { subscribeToEvent, EventConfig } from "./genericEventListening";
import { closeViemClient, createWebSocketClient } from "../adapter/websocket";
import { processEvent } from "./genericEventProcessing";
import {
  Storer,
  Transformer,
  Filter,
  Preprocessor,
} from "../model/genericTypes";
import { Logger } from "winston";
import {
  type PublicClient,
  type Transport,
  type Chain,
  WebSocketTransportConfig,
} from "viem";
import Bottleneck from "bottleneck";
import { DataDogMetricsService } from "../../services/MetricsService";

/**
 * @file This file contains the master orchestrator for a single indexing subsystem.
 * An "indexing subsystem" is a complete producer-consumer pipeline for a specific
 * set of events on a single chain.
 *
 * The `startIndexingSubsystem` function wires together all the components:
 * - The WebSocket Listener (Producer)
 * - The Event Processors (Consumers)
 */

/**
 * An event handler for a specific event.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TEventEntity The type of the structured database entity.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface IndexerEventHandler<
  TDb,
  TPayload,
  TEventEntity,
  TPreprocessed,
> {
  config: EventConfig;
  preprocess: Preprocessor<TPayload, TPreprocessed>;
  transform: Transformer<TPreprocessed, TPayload, TEventEntity>;
  store: Storer<TEventEntity, TDb>;
  filter?: Filter<TPreprocessed, TPayload>;
}

/**
 * Configuration for a complete indexing subsystem.
 * @template TEventEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface IndexerConfig<TEventEntity, TDb, TPayload, TPreprocessed> {
  /** The ID of the blockchain to connect to. */
  chainId: number;
  /** The WebSocket RPC URL for the blockchain. */
  rpcUrl: string;
  /**
   * An array of event configurations, each including an `EventConfig`, a `Transformer`
   * function to convert the raw event payload to an entity, and a `Storer` function
   * to persist the entity to the database.
   */
  events: Array<
    IndexerEventHandler<TDb, TPayload, TEventEntity, TPreprocessed>
  >;
  /** Optional WebSocket transport options */
  transportOptions?: WebSocketTransportConfig;
}

/**
 * Request object for starting an indexing subsystem.
 * @template TEventEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface StartIndexingSubsystemRequest<
  TEventEntity,
  TDb,
  TPayload,
  TPreprocessed,
> {
  /** The database instance. */
  db: TDb;
  /** The configuration for the indexer subsystem. */
  indexerConfig: IndexerConfig<TEventEntity, TDb, TPayload, TPreprocessed>;
  /** An optional logger instance. */
  logger: Logger;
  /** An optional AbortSignal to gracefully shut down the indexer. */
  sigterm?: AbortSignal;
  /** An optional metrics service instance. */
  metrics?: DataDogMetricsService;
}

/**
 * Initializes and starts a complete, self-contained indexing subsystem for a given chain and event.
 * This function sets up the producer (listener) and the consumers (processors).
 *
 * @template TEntity The type of the structured database entity (e.g., `UniTransfer`).
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 *
 * @param request The request object containing the database instance, indexer configuration, and the logger.
 */
export async function startIndexing<TEventEntity, TDb, TPayload, TPreprocessed>(
  request: StartIndexingSubsystemRequest<
    TEventEntity,
    TDb,
    TPayload,
    TPreprocessed
  >,
) {
  const { db, indexerConfig, sigterm, logger, metrics } = request;
  // Upon receiving an error we wait some period of time before retrying to start the listener again
  // The time period has an exponential backoff mechanism to it, to avoid spamming the restart functionality
  // The maximum amount of time we wait for is 1 minute between retries
  let delay = 1000;
  const MAX_DELAY = 60 * 1000;

  // Track active resources for cleanup
  let viemClient: PublicClient<Transport, Chain>;
  // Setup the Queue
  // We use this queue to unblock our websocket listeners
  // The onLog call would otherwise block the websocket from receiving new events until it is done
  const processingQueue = new Bottleneck({ maxConcurrent: null, minTime: 0 });
  let unwatchFunctions: Array<() => void> = [];

  // --- Helper: Cleanup active connections ---
  const tearDown = async () => {
    try {
      if (unwatchFunctions.length > 0) {
        logger.debug({
          at: "genericIndexing#tearDown",
          message: "Unwatching subscriptions...",
        });
        unwatchFunctions.forEach((unwatch) => unwatch());
        unwatchFunctions = [];
      }
      if (viemClient) {
        logger.debug({
          at: "genericIndexing#tearDown",
          message: "Closing WebSocket connection...",
        });

        await closeViemClient(viemClient, logger);
      }
    } catch (err) {
      logger.warn({
        at: "genericIndexing#tearDown",
        message: "Error during cleanup",
        error: err,
      });
    }
  };

  // --- Supervisor Loop ---
  while (!sigterm?.aborted) {
    try {
      logger.info({
        at: "genericIndexing#startIndexingSubsystem",
        message: `Initializing indexing subsystem for chain ${indexerConfig.chainId}...`,
        notificationPath: "across-indexer-info",
      });

      // Initialize Client
      viemClient = createWebSocketClient(
        indexerConfig.chainId,
        indexerConfig.rpcUrl,
        logger,
        indexerConfig.transportOptions,
      );

      // --- Mechanism to detect Listener Crashes ---
      // We create a "Rejector" that we can pass down to the listener.
      // If the listener calls this, this promise will reject, causing the
      // Promise.race below to throw, which triggers the catch block and restarts the loop.
      let triggerRestart: (reason?: any) => void;

      // Setup Subscriptions
      for (const eventItem of indexerConfig.events) {
        const { config, transform, store, filter, preprocess } = eventItem;
        const unwatch = subscribeToEvent<TPayload>({
          client: viemClient,
          processingQueue,
          chainId: indexerConfig.chainId,
          config,
          // This function defines what happens after we receive an event from the websocket RPC provider
          // In this case we directly call the event processor and have it running in the background to not block the websocket from receiving new events
          onEvent: (payload) => {
            const startProcessing = Date.now();

            const eventSource = async () => Promise.resolve(payload);
            processEvent<TEventEntity, TDb, TPayload, TPreprocessed>({
              db,
              source: eventSource,
              preprocess,
              transform,
              store,
              filter,
              logger,
            }).then(() => {
              metrics?.addGaugeMetric(
                "processEvent",
                Date.now() - startProcessing,
                [
                  "websocketIndexer",
                  "onEvent",
                  "startIndexing",
                  `chainId:${indexerConfig.chainId}`,
                  `event:${config.eventName}`,
                ],
              );
            });
          },
          // If Viem errors out (e.g. WS drops and fails retries),
          // we trigger the restart of the entire subsystem.
          onFatalError: (err) => {
            metrics?.addCountMetric("onFatalError", [
              "websocketIndexer",
              "startIndexing",
              `chainId:${indexerConfig.chainId}`,
              `event:${config.eventName}`,
            ]);
            triggerRestart(err);
          },
          logger,
          metrics,
        });
        // We collect all the unwatch functions. We need them to shut down the viem subscriber once we want to tearn the indexer down
        if (unwatch) unwatchFunctions.push(unwatch);
      }

      // Reset Delay on successful startup
      delay = 1000;

      // --- The "Keep Alive" Wait ---
      // We wait for EITHER:
      // 1. The user to shut down (Sigterm) -> Resolves peacefully
      // 2. A listener to crash (FatalError) -> Rejects, triggers catch block
      await Promise.race([
        // The first condition is to exit the loop if the user sends an abort signal
        new Promise<void>((resolve) => {
          if (sigterm) {
            const onAbort = () => resolve();
            if (sigterm.aborted) return resolve();
            sigterm.addEventListener("abort", onAbort, { once: true });
          }
        }),
        // The second condition will trigger the error catch block below, logging the error,
        // triggering the exponential backoff and then restart the loop and try to restart the event listener again
        new Promise<void>((_, reject) => {
          // If a promise is being rejected, it throws and exception (which can then be caught in an error handling block)
          triggerRestart = reject;
        }),
      ]);
    } catch (e) {
      // Handle Errors & Restart
      logger.error({
        at: "genericIndexing#startIndexingSubsystem",
        message: `Indexer crashed for chain ${indexerConfig.chainId}. Restarting in ${delay / 1000}s.`,
        error: (e as Error).message,
      });
      metrics?.addCountMetric("startIndexingError", [
        "websocketIndexer",
        "startIndexing",
        `chainId:${indexerConfig.chainId}`,
      ]);

      // Clean up dead connections
      await tearDown();

      // Wait (unless we are shutting down)
      if (!sigterm?.aborted) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_DELAY);
      }
    }
  }

  // Final cleanup on exit
  logger.info({
    at: "genericIndexing#startIndexingSubsystem",
    message: `Stopping indexing subsystem for chain ${indexerConfig.chainId}.`,
  });
  await tearDown();
}
