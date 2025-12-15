export type DatabaseConfig = {
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
};

/**
 * Enum to represent the result type of a query.
 * - If the entity is identical to the one in the database, return `Nothing`.
 * - If the unique keys are not present, return Inserted.
 * - If the finalised field was the only one that changed, return `Finalised`.
 * - If any of the entity fields were changed, return Updated.
 * - If both the finalised field and other fields were changed, return UpdatedAndFinalised.
 */
export enum SaveQueryResultType {
  Nothing = "nothing",
  Inserted = "inserted",
  Finalised = "finalised",
  Updated = "updated",
  UpdatedAndFinalised = "updatedAndFinalised",
}

export type SaveQueryResult<T> = {
  data: T;
  result: SaveQueryResultType;
};

export enum DataSourceType {
  WEB_SOCKET = "WebSocket",
  POLLING = "Polling",
}
