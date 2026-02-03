import {
  EventSource,
  Storer,
  Transformer,
  Filter,
  Preprocessor,
  PostProcessor,
} from "../model/genericTypes";
import { SaveQueryResult } from "@repo/indexer-database";
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
 * @template TStoredEntity The type of the stored database entity.
 * @template TDb The type of the database client/connection.
 * @template TRepository The type of the repository used for storage.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface GenericEventProcessorRequest<
  TEntity,
  TStoredEntity,
  TDb,
  TRepository,
  TPayload,
  TPreprocessed,
> {
  /** The database instance. */
  db: TDb;
  /** The repository instance. */
  repository: TRepository;
  /** The function to source events. */
  source: EventSource<TPayload>;
  /** The function to preprocess the event payload. */
  preprocess: Preprocessor<TPayload, TPreprocessed>;
  /** The function to transform the event payload into an entity. */
  transform: Transformer<TPreprocessed, TPayload, TEntity>;
  /** The function to store the entity in the database. */
  store: Storer<TEntity, TRepository, TStoredEntity>;
  /** The function to filter the entity. */
  filter?: Filter<TPreprocessed, TPayload>;
  /** An optional logger instance. */
  logger?: Logger;
  /** The function to post-process the entity. */
  postProcess?: PostProcessor<TStoredEntity, TDb, TPayload>;
}

/**
 * The generic event processor (a "worker").
 * This function orchestrates a single fetch-transform-store pipeline operation. It is designed
 * to be called repeatedly by a listener.
 *
 * - **Source:** It calls the `source` function, which should provide a new event payload.
 * - **Preprocess:** (Optional) It preprocesses the payload.
 * - **Filter:** It passes the preprocessed data and raw payload to the `filter` function.
 * - **Transform:** It passes the preprocessed data and raw payload to the `transform` function.
 * - **Store:** It passes the resulting entity to the `store` function for persistence.
 *
 * This generic design allows the same worker logic to process any type of event,
 * simply by being initialized with different `source`, `transform`, and `store` functions.
 *
 * @template TEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TRepository The type of the repository used for storage.
 * @template TPayload The type of the raw event.
 * @template TPreprocessed The type of the preprocessed data.
 * @param request The request object containing db, repository, source, transform, store, and logger.
 */
export const processEvent = async <
  TEntity,
  TStoredEntity,
  TDb,
  TRepository,
  TPayload,
  TPreprocessed,
>(
  request: GenericEventProcessorRequest<
    TEntity,
    TStoredEntity,
    TDb,
    TRepository,
    TPayload,
    TPreprocessed
  >,
): Promise<void> => {
  const {
    db,
    repository,
    source,
    preprocess,
    transform,
    store,
    filter,
    logger,
    postProcess,
  } = request;
  // A try-catch block is used to gracefully handle any errors that occur during the
  // sourcing, transformation, or storage of an event. This prevents a single failing
  // event from crashing the entire listening process.
  try {
    // Fetch (Blocking operation, waits for a new event payload)
    // The source can be directly from an event listener or it can come from a message queue.
    // The async aspect makes it usable for both scenarios
    const payload = await source();

    // Preprocess
    let preprocessed: TPreprocessed = await preprocess(payload);

    // Filter
    if (filter && !(await filter(preprocessed, payload))) {
      return;
    }

    // Transform
    const entity = await transform(preprocessed, payload);

    // Store (Asynchronous I/O operation)
    const storedItem = await store(entity, repository);

    // Post-process
    if (postProcess) {
      await postProcess(db, storedItem, payload);
    }

    logger?.debug({
      at: "genericEventProcessor#genericEventProcessor",
      // Map over the array to create a readable string like: "DepositForBurn#123, Transfer#456"
      message: `Successfully stored event: ${(storedItem as any).constructor.name}#${(storedItem as any).id}`,
    });
  } catch (error) {
    logger?.error({
      at: "genericEventProcessor#genericEventProcessor",
      message: "Error processing event.",
      notificationPath: "across-indexer-error",
      error,
    });
  }
};
