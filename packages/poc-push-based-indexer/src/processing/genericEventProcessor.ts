/**
 * @file Implements the "Event Processor" service from the design document.
 * This file defines a generic, functional-style event processing pipeline. It is designed
 * to be completely agnostic of the event type, data source, and storage mechanism.
 *
 * The core component is `startGenericEventProcessor`, which orchestrates a continuous
 * loop of fetching, transforming, and storing data.
 */

// --- Functional Types for the Generic Pipeline ---

/**
 * A function that provides the next event to be processed.
 * This is designed to be a "blocking" function. It should return a Promise that
 * resolves only when a new event is available. In this PoC, this function will
 * be `AsyncQueue.pop()`.
 * @template TEvent The type of the raw event to be sourced.
 * @returns A Promise that resolves with a new event.
 */
export type EventSource<TEvent> = () => Promise<TEvent>;

/**
 * A function that transforms a raw event into a structured database entity.
 * This should be a pure function with no side effects, as per the design principles.
 * @template TEvent The type of the raw input event.
 * @template TEntity The type of the structured output entity.
 * @param event The raw event from the `EventSource`.
 * @returns The transformed entity, or a Promise that resolves with it.
 */
export type Transformer<TEvent, TEntity> = (
  event: TEvent,
) => TEntity | Promise<TEntity>;

/**
 * A function that persists a transformed entity to a database.
 * This function is responsible for the side effect of writing to the database.
 * @template TEntity The type of the structured entity to be stored.
 * @template TDb The type of the database connection or client.
 * @param entity The entity returned by the `Transformer`.
 * @param db The database client/connection instance.
 * @returns A Promise that resolves when the storage operation is complete.
 */
export type Storer<TEntity, TDb> = (entity: TEntity, db: TDb) => Promise<void>;

// --- Main Processor Logic ---

/**
 * Starts a generic, infinite event processing loop (a "worker").
 * This function continuously orchestrates the fetch-transform-store pipeline.
 *
 * - **Fetch:** It calls the `source` function, which blocks until an event is available.
 * - **Transform:** It passes the received event to the `transform` function.
 * - **Store:** It passes the resulting entity to the `store` function for persistence.
 *
 * This generic design allows the same worker logic to process any type of event,
 * simply by being initialized with different `source`, `transform`, and `store` functions.
 *
 * @template TEvent The type of the raw event.
 * @template TEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @param db The database client instance (e.g., `InMemoryDatabase` in this PoC).
 * @param source The blocking function that provides new events (e.g., `queue.pop`).
 * @param transform The pure function to map the raw event to a database entity.
 * @param store The function to persist the entity to the database.
 * @param workerId A unique identifier for this worker instance, for logging.
 */
export const startGenericEventProcessor = async <TEvent, TEntity, TDb>(
  db: TDb,
  source: EventSource<TEvent>,
  transform: Transformer<TEvent, TEntity>,
  store: Storer<TEntity, TDb>,
  workerId: number,
): Promise<void> => {
  console.log(`⚙️ [Worker #${workerId}] Generic event processor started.`);

  while (true) {
    try {
      // Fetch (Blocking operation, waits for an item from the queue)
      const event = await source();
      console.log(`[Worker #${workerId}] Picked up event.`);

      // Transform (Pure, synchronous logic)
      const entity = await transform(event);

      // Store (Asynchronous I/O operation)
      await store(entity, db);

      console.log(`✅ [Worker #${workerId}] Event processed successfully.`);
    } catch (error) {
      console.error(
        `⚠️ [Worker #${workerId}] Error in processing loop:`,
        error,
      );
      // In a real system, you might want to add a delay here before continuing.
    }
  }
};
