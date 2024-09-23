import { HttpStatus } from "./httpStatus";

export class DepositNotFoundException extends Error {
  statusCode: number;
  constructor() {
    super("Deposit not found");
    this.name = "DepositNotFoundException";
    this.statusCode = HttpStatus.NOT_FOUND;
  }
}
