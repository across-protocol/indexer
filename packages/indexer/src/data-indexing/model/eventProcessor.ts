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
 * A function that transforms a raw event into a structured database entity.
 * This should be a pure function with no side effects, as per the design principles.
 * @template TPayload The type of the raw input event.
 * @template TEntity The type of the structured output entity.
 * @param payload The raw payload from the `EventSource`.
 * @returns The transformed entity, or a Promise that resolves with it.
 */
export type Transformer<TPayload, TEntity> = (
  payload: TPayload,
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
export type Storer<TEntity, TDb> = (
  entity: TEntity,
  db: TDb,
) => Promise<void | SaveQueryResult<TEntity>[]>;
