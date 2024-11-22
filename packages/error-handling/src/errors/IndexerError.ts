/**
 * Generic Error class that should be used in the Indexer to
 * provide common error patterns to log
 */
export abstract class IndexerError extends Error {
  constructor(
    private readonly errorName: string,
    private readonly errorMessage: string,
    private readonly errorData?: Record<string, string>,
  ) {
    super(errorMessage);
  }

  /**
   * A function used by `JSON.stringify` to specify which data will be serialized
   * @returns A formatted JSON
   */
  public toJSON(): Record<string, unknown> {
    return {
      error: this.errorName,
      message: this.errorMessage,
      data: this.errorData,
    };
  }
}
