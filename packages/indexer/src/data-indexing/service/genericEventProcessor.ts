import { EventSource, Storer, Transformer } from "../model/eventProcessor";
import { Logger } from "winston";

/**
 * @file Implements the "Event Processor" service from the design document.
 * This file defines a generic, functional-style event processing pipeline. It is designed
 * to be completely agnostic of the event type, data source, and storage mechanism.
 *
 * The core component is `startGenericEventProcessor`, which orchestrates a continuous
 * loop of fetching, transforming, and storing data.
 */

/**
 * Request object for starting a generic event processor.
 * @template TEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 */
export interface StartGenericEventProcessorRequest<TEntity, TDb, TPayload> {
  /** The database instance. */
  db: TDb;
  /** The function to source events. */
  source: EventSource<TPayload>;
  /** The function to transform the event payload into an entity. */
  transform: Transformer<TPayload, TEntity>;
  /** The function to store the entity in the database. */
  store: Storer<TEntity, TDb>;
  /** An optional logger instance. */
  logger?: Logger;
}

/**
 * Starts a generic, infinite event processing loop (a "worker").
 * This function continuously orchestrates the fetch-transform-store pipeline.
 *
 * - **Source:** It calls the `source` function, which blocks until an event is available.
 * - **Transform:** It passes the received event to the `transform` function.
 * - **Store:** It passes the resulting entity to the `store` function for persistence.
 *
 * This generic design allows the same worker logic to process any type of event,
 * simply by being initialized with different `source`, `transform`, and `store` functions.
 *
 * @template TEvent The type of the raw event.
 * @template TEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @param request The request object containing db, source, transform, store, and logger.
 */
export const startGenericEventProcessor = async <TEntity, TDb, TPayload>(
  request: StartGenericEventProcessorRequest<TEntity, TDb, TPayload>,
): Promise<void> => {
  const {
    db,
    source,
    transform,
    store,
    logger = console as unknown as Logger,
  } = request;
  // We need to wrap this in a try catch because we call the processor without waiting for its result, which would result in an unhandled promise rejection
  try {
    // Fetch (Blocking operation, waits for a new event payload)
    // The source can be directly from an event listener or it can come from a message queue.
    // The async aspect makes it usable for both scenarios
    const payload = await source();
    // Transform
    const entity = await transform(payload);
    // Store (Asynchronous I/O operation)
    await store(entity, db);
  } catch (error) {
    logger.error({
      at: "genericEventProcessor#startGenericEventProcessor",
      message: "Error processing event.",
      notificationPath: "across-indexer-error",
      error: (error as Error).message,
    });
  }
};
