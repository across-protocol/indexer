import {
  createWebSocketProvider,
  IndexerEventPayload,
  subscribeToEvent,
  EventConfig,
} from "../listening/genericEventListener";
import {
  startGenericEventProcessor,
  Storer,
  Transformer,
} from "../processing/genericEventProcessor";
import { AsyncQueue } from "../utils/utils";

/**
 * @file This file contains the master orchestrator for a single indexing subsystem.
 * An "indexing subsystem" is a complete producer-consumer pipeline for a specific
 * set of events on a single chain.
 *
 * The `startIndexerSubsystem` function wires together all the components:
 * - The WebSocket Listener (Producer)
 * - The Message Queue (Buffer)
 * - The Event Processors (Consumers)
 */

/**
 * Configuration for a complete indexing subsystem.
 */
export interface IndexerConfig {
  /** The ID of the blockchain to connect to. */
  chainId: number;
  /** The WebSocket RPC URL for the blockchain. */
  rpcUrl: string;
  events: Array<{
    config: EventConfig;
    workerCount: number;
  }>;
}

/**
 * Initializes and starts a complete, self-contained indexing subsystem for a given chain and event.
 * This function sets up the producer (listener), the consumers (processors), and the queue that
 * connects them.
 *
 * @template TEntity The type of the structured database entity (e.g., `UniTransfer`).
 * @template TDb The type of the database client/connection.
 *
 * @param db The database instance that will be passed to the storage function.
 * @param queue The message queue instance (e.g., `AsyncQueue`) that connects the producer and consumers.
 * @param config The configuration object specifying the chain, RPC endpoint, and event to index.
 * @param transform The pure function to transform a raw `IndexerEventPayload` into the `TEntity` format.
 * @param storeFactory A factory function that returns a `Storer` function. This allows each worker
 *                     to have a potentially unique storage function, for instance, to log with its own ID.
 * @returns An object containing the active provider and a promise representing the worker pool.
 */
export async function startIndexerSubsystem<TEntity, TDb>(
  db: TDb,
  queue: AsyncQueue<IndexerEventPayload>,
  indexerConfig: IndexerConfig,
  transform: Transformer<IndexerEventPayload, TEntity>,
  storeFactory: (workerId: number) => Storer<TEntity, TDb>,
) {
  console.log(
    `\n📡 Initializing indexing subsystem for chain ${indexerConfig.chainId}...`,
  );

  // PRODUCER: Create and configure the WebSocket listener.
  const provider = createWebSocketProvider(
    indexerConfig.chainId,
    indexerConfig.rpcUrl,
  );

  const allWorkers: Promise<void>[] = [];
  for (const eventItem of indexerConfig.events) {
    const { config, workerCount } = eventItem;
    // Construct Topic: {chainId}.{contractAddress}.{EventName}
    const topic = `${indexerConfig.chainId}.${config.address}.${config.eventName}`;
    console.log(`ℹ️  Configuring Topic: ${topic} with ${workerCount} workers`);

    // Subscribe to the event, with the "onEvent" callback being a simple push to the queue.
    subscribeToEvent(
      provider,
      indexerConfig.chainId,
      config,
      topic,
      (topicName, event) => {
        console.log(
          `➡️  [Listener/Chain ${indexerConfig.chainId}] Pushed to '${topicName}' (Block: ${event.blockNumber})`,
        );
        queue.push(topicName, event);
      },
    );

    // CONSUMERS: Start a pool of workers to process events from the queue.
    console.log(
      `👷 Starting ${workerCount} event processor workers for chain ${indexerConfig.chainId}...`,
    );

    // The `eventSource` is the same for all workers: they all pull from the same queue.
    const eventSource = () => queue.pop(topic);

    const topicWorkers = Array.from({ length: workerCount }).map((_, index) => {
      const workerId = index + 1;

      // Use the factory to create a storer function specific to this worker.
      const workerStore = storeFactory(workerId);

      // Start a single, generic event processor loop. It will run forever.
      return startGenericEventProcessor(
        db,
        eventSource,
        transform,
        workerStore,
        workerId,
      );
    });
    allWorkers.push(...topicWorkers);
  }

  return {
    provider,
    workerPool: Promise.all(allWorkers),
  };
}
