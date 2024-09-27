import { HttpError } from "../express-app";
import { HttpStatus } from "../model/httpStatus";

export class DepositNotFoundException extends HttpError {
  constructor() {
    super("Deposit not found");
    this.name = "DepositNotFoundException";
    this.status = HttpStatus.NOT_FOUND;
  }
}

export class IndexParamOutOfRangeException extends HttpError {
  constructor(message: string) {
    super(message);
    this.name = "IndexParamOutOfRangeException";
    this.status = HttpStatus.BAD_REQUEST;
  }
}
