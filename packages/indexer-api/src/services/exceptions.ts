import { IndexerHTTPError, StatusCodes } from "@repo/error-handling";

export class DepositNotFoundException extends IndexerHTTPError {
  constructor() {
    super(
      StatusCodes.NOT_FOUND,
      DepositNotFoundException.name,
      "Deposit not found given the provided constraints",
    );
  }
}

export class IndexParamOutOfRangeException extends IndexerHTTPError {
  constructor(message: string) {
    super(StatusCodes.BAD_REQUEST, IndexParamOutOfRangeException.name, message);
  }
}

export class IncorrectQueryParamsException extends IndexerHTTPError {
  constructor() {
    super(
      StatusCodes.BAD_REQUEST,
      IncorrectQueryParamsException.name,
      "Incorrect query params provided",
    );
  }
}
