import { SaveQueryResult } from "@repo/indexer-database";

/**
 * A function that provides the next event to be processed.
 * This is designed to be a "blocking" function. It should return a Promise that
 * resolves only when a new event is available.
 * @template TPayload The type of the raw payload to be sourced.
 * @returns A Promise that resolves with a new event.
 */
export type EventSource<TPayload> = () => Promise<TPayload>;

/**
 * A function that transforms a preprocessed event into a structured database entity.
 * This should be a pure function with no side effects, as per the design principles.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TPayload The type of the raw input event.
 * @template TTransformed The type of the structured output entity.
 * @param preprocessed The preprocessed data.
 * @param payload The raw payload from the `EventSource`.
 * @returns The transformed entity, or a Promise that resolves with it.
 */
export type Transformer<TPayload, TPreprocessed, TTransformed> = (
  preprocessed: TPreprocessed,
  payload: TPayload,
) => TTransformed | Promise<TTransformed>;

/**
 * A function that persists a transformed entity to a database.
 * This function is responsible for the side effect of writing to the database.
 * @template TDb The type of the database connection or client.
 * @template TTransformed The type of the transformed raw event.
 * @template TStored The type of the stored event.
 * @param transformed The transformed raw event returned by the `Transformer`.
 * @param db The database client/connection instance.
 * @returns A Promise that resolves when the storage operation is complete.
 */
export type Storer<TDb, TTransformed, TStored> = (
  transformed: TTransformed,
  db: TDb,
) => Promise<TStored>;

/**
 * A function that determines if an event should be processed and stored.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TPayload The type of the raw payload.
 * @param preprocessed The preprocessed data.
 * @param payload The raw payload.
 * @returns A Promise that resolves to true if the event should be processed, false otherwise.
 */
export type Filter<TPayload, TPreprocessed> = (
  preprocessed: TPreprocessed,
  payload: TPayload,
) => Promise<boolean> | boolean;

/**
 * A function that preprocesses the raw payload into a structured/decoded object.
 * @template TPayload The type of the raw payload.
 * @template TPreprocessed The type of the output preprocessed data.
 * @param payload The raw payload.
 * @returns The preprocessed data.
 */
export type Preprocessor<TPayload, TPreprocessed> = (
  payload: TPayload,
) => Promise<TPreprocessed> | TPreprocessed;
