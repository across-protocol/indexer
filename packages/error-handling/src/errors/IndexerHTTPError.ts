import { StatusCodes } from "http-status-codes";
import { IndexerError } from "./IndexerError";

export { StatusCodes };

/**
 * Used to distinguish a similar design pattern as {@link IndexerError} but with
 * additional HTTP context
 * @see {@link IndexerError}
 */
export abstract class IndexerHTTPError extends IndexerError {
  constructor(
    public readonly httpStatusCode: StatusCodes,
    errorName: string,
    errorMessage: string,
    errorData?: Record<string, string>,
  ) {
    super(errorName, errorMessage, errorData);
  }
}
