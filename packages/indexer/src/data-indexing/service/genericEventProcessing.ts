import {
  EventSource,
  Storer,
  Transformer,
  Filter,
  Preprocessor,
  PostProcessor,
} from "../model/genericTypes";
import { Logger } from "winston";

/**
 * Set of functions required to process an event (excluding sourcing).
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TTransformed The type of the structured database entity.
 * @template TStored The type of the stored event.
 */
export interface ProcessEventFns<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
> {
  /** The function to preprocess the event payload. */
  preprocess: Preprocessor<TPayload, TPreprocessed>;
  /** The function to filter the event payload. */
  filter?: Filter<TPayload, TPreprocessed>;
  /** The function to transform the event payload into an entity. */
  transform: Transformer<TPayload, TPreprocessed, TTransformed>;
  /** The function to store the entity in the database. */
  store: Storer<TDb, TTransformed, TStored>;
  /** The function to post-process the entity. */
  postProcess?: PostProcessor<TDb, TPayload, TStored>;
}

/**
 * The complete processing pipeline combining sourcing and processing.
 */
export type ProcessingEventPipeline<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
> = { source: EventSource<TPayload> } & ProcessEventFns<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored
>;

/**
 * Request object for the generic event processor.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TTransformed The type of the structured database entity.
 * @template TStored The type of the stored event.
 */
export interface GenericEventProcessorRequest<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
> {
  /** The database instance. */
  db: TDb;
  /** The set of functions for sourcng and processing the event. */
  eventProcessingPipeline: ProcessingEventPipeline<
    TDb,
    TPayload,
    TPreprocessed,
    TTransformed,
    TStored
  >;
  /** An optional logger instance. */
  logger?: Logger;
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
 * @template TEvent The type of the raw event.
 * @template TTransformed The type of the transformed raw event.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the raw event.
 * @template TPreprocessed The type of the preprocessed data.
 * @param request The request object containing db, repository, source, transform, store, and logger.
 */
export const processEvent = async <
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
>(
  request: GenericEventProcessorRequest<
    TDb,
    TPayload,
    TPreprocessed,
    TTransformed,
    TStored
  >,
): Promise<void> => {
  const { db, eventProcessingPipeline, logger } = request;
  const { source, preprocess, filter, transform, store, postProcess } =
    eventProcessingPipeline;
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
    const storedItem = await store(entity, db);

    logger?.debug({
      at: "genericEventProcessor#genericEventProcessor",
      // Map over the array to create a readable string like: "DepositForBurn#123, Transfer#456"
      message: `Successfully stored event: ${(storedItem as any).constructor.name}#${(storedItem as any).id}`,
    });

    if (postProcess) {
      await postProcess(db, payload, storedItem);
    }
  } catch (error) {
    logger?.error({
      at: "genericEventProcessor#genericEventProcessor",
      message: "Error processing event.",
      notificationPath: "across-indexer-error",
      error,
    });
  }
};
