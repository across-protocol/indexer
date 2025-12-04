import { EventSource, Storer, Transformer } from "../model/genericTypes";
import { Logger } from "winston";

/**
 * @file Implements the "Event Processor" service.
 * This file defines a generic, functional-style event processing pipeline. It is designed
 * to be completely agnostic of the event type, data source, and storage mechanism.
 *
 * The core component is `genericEventProcessor`, which orchestrates a single
 * fetch-transform-store operation. It is intended to be called within a continuous loop
 * by a listener service.
 */

/**
 * Request object for the generic event processor.
 * @template TEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 */
export interface GenericEventProcessorRequest<TEntity, TDb, TPayload> {
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
 * The generic event processor (a "worker").
 * This function orchestrates a single fetch-transform-store pipeline operation. It is designed
 * to be called repeatedly by a listener.
 *
 * - **Source:** It calls the `source` function, which should provide a new event payload.
 * - **Transform:** It passes the received payload to the `transform` function.
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
export const processEvent = async <TEntity, TDb, TPayload>(
  request: GenericEventProcessorRequest<TEntity, TDb, TPayload>,
): Promise<void> => {
  const {
    db,
    source,
    transform,
    store,
    logger = console as unknown as Logger,
  } = request;
  // A try-catch block is used to gracefully handle any errors that occur during the
  // sourcing, transformation, or storage of an event. This prevents a single failing
  // event from crashing the entire listening process.
  try {
    // Fetch (Blocking operation, waits for a new event payload)
    // The source can be directly from an event listener or it can come from a message queue.
    // The async aspect makes it usable for both scenarios
    const payload = await source();
    // Transform
    const entity = await transform(payload);
    // Store (Asynchronous I/O operation)
    const storedItems = await store(entity, db);

    logger.debug({
      at: "genericEventProcessor#genericEventProcessor",
      // Map over the array to create a readable string like: "DepositForBurn#123, Transfer#456"
      message: `Successfully stored event: ${storedItems
        .map(
          (entry) =>
            `${(entry.data as any).constructor.name}#${(entry.data as any).id}`,
        )
        .join(", ")}`,
      notificationPath: "across-indexer-error",
    });
  } catch (error) {
    logger.error({
      at: "genericEventProcessor#genericEventProcessor",
      message: "Error processing event.",
      notificationPath: "across-indexer-error",
      error,
    });
  }
};
