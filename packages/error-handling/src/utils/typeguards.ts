import { IndexerError, IndexerHTTPError } from "../errors";

/**
 * Typeguard to confirm that an object is an IndexerError
 * @param error The error object to validate
 * @returns Whether this object is an instance of `IndexerError` (or a descendent)
 */
export function isIndexerError(error: unknown): error is IndexerError {
  return error instanceof IndexerError;
}

/**
 * Typeguard to confirm that an object is an IndexerHTTPError
 * @param error The error object to validate
 * @returns Whether this object is an instance of `IndexerHTTPError` (or a descendent)
 */
export function isIndexerHTTPError(error: unknown): error is IndexerHTTPError {
  return error instanceof IndexerHTTPError;
}
