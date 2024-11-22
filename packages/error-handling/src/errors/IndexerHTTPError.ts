import { StatusCodes } from "http-status-codes";
import { IndexerError } from "./IndexerError";

/**
 * Used to distinguish a similar design pattern as {@link IndexerError} but with
 * additional HTTP context
 * @see {@link IndexerError}
 */
export abstract class IndexerHTTPError extends IndexerError {
  constructor(
    private readonly httpStatusCode: StatusCodes,
    errorName: string,
    errorMessage: string,
    errorData?: Record<string, string>,
  ) {
    super(errorName, errorMessage, errorData);
  }

  /**
   * A function used by `JSON.stringify` to specify which data will be serialized
   * @returns A formatted JSON
   */
  public toJSON(): Record<string, unknown> {
    return {
      statusCode: this.httpStatusCode,
      ...super.toJSON(),
    };
  }
}
