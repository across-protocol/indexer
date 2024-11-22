import { IndexerError } from "./IndexerError";

export class AssertError extends IndexerError {
  constructor(message: string) {
    super(AssertError.name, message);
  }
}
