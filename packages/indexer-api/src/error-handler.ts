import {
  isIndexerError,
  isIndexerHTTPError,
  StatusCodes,
} from "@repo/error-handling";
import { Request, Response, NextFunction } from "express";
import { isHttpError } from "./express-app";
import { StructError } from "superstruct";

const DEFAULT_STATUS = StatusCodes.BAD_REQUEST;

const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _: NextFunction,
): void => {
  // At a base level we need to confirm that this isn't a valid
  // passthrough - if so ignore
  if (isIndexerError(err)) {
    // If we have a custom sub-type to specify the error code, use it
    // otherwise default to a status 400
    const httpStatus = isIndexerHTTPError(err)
      ? err.httpStatusCode
      : DEFAULT_STATUS;
    res.status(httpStatus).json(err.toJSON());
  } else if (isHttpError(err)) {
    res.status(err.status ?? DEFAULT_STATUS).json({
      message: err.message,
      error: "NavigationError",
    });
  } else if (err instanceof StructError) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: "InputValidationError",
      message: err.message,
    });
  } else if (err instanceof Error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "UnknownError",
      message: err.message,
    });
  }
};

export default errorHandler;
