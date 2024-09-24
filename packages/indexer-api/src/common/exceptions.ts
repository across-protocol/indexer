import { ExtendedError } from "../express-app";
import { HttpStatus } from "./httpStatus";

export class DepositNotFoundException extends ExtendedError {
  constructor() {
    super("Deposit not found");
    this.name = "DepositNotFoundException";
    this.status = HttpStatus.NOT_FOUND;
  }
}

export class IndexParamOutOfRangeException extends ExtendedError {
  constructor(message: string) {
    super(message);
    this.name = "IndexParamOutOfRangeException";
    this.status = HttpStatus.BAD_REQUEST;
  }
}
