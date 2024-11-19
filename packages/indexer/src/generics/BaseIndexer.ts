import winston from "winston";
import * as across from "@across-protocol/sdk";

import { AlertingService, SlackMessageFormatter } from "@repo/alerting";

/**
 * Base indexer class that all indexers should extend
 */
export abstract class BaseIndexer {
  protected stopRequested: boolean;

  constructor(
    protected readonly logger: winston.Logger,
    private readonly name: string,
    private readonly alertingService?: AlertingService,
  ) {
    this.logger.debug({
      at: "BaseIndexer#constructor",
      message: `Instantiated indexer ${name}`,
    });
  }

  /**
   * Initiates the indexer to start running.
   * @dev This method calls the `indexerLogic` method in a loop with a delay between each iteration.
   * @dev This method calls the `initialize` method before starting the loop to allow for any setup that needs to be done before the indexer starts.
   * @dev You can stop the indexer by calling the `stop` method. This will set a flag that the indexer should stop at the next opportunity.
   * @param delay The delay in seconds between each iteration of the indexer
   */
  public async start(delay: number): Promise<void> {
    this.logger.info({
      at: "BaseIndexer#start",
      message: `Starting indexer ${this.name}`,
    });

    try {
      // Initialize the indexer before starting the loop
      await this.initialize();
    } catch (e) {
      this.logger.error({
        at: "BaseIndexer#start",
        message: `Failed to initialize ${this.name}`,
        error: (e as unknown as Error).message,
      });
      return;
    }

    this.stopRequested = false;
    do {
      try {
        await this.indexerLogic();
      } catch (error) {
        this.postErrorOnSlack(error);
        this.logger.error({
          at: "BaseIndexer::start",
          message: `Error processing ${this.name}`,
          error,
        });
      }
      await across.utils.delay(delay);
    } while (!this.stopRequested);

    this.logger.info({
      at: "BaseIndexer#start",
      message: `Ended halted ${this.name}`,
    });
  }

  /**
   * Issues a stop request to the indexer.
   * @dev Note: this does not stop the indexer immediately, but sets a flag that the indexer should stop at the next opportunity.
   */
  public stop(): void {
    this.logger.info({
      at: "BaseIndexer#stop",
      message: `Requesting indexer ${this.name} to be stopped`,
    });
    this.stopRequested = true;
  }

  /**
   * The main logic of the indexer. This method should be implemented by the child class and is expected to be run within the context of a loop.
   */
  protected abstract indexerLogic(): Promise<void>;

  /**
   * The initialization logic of the indexer. This method should be implemented by the child class and is expected to be run before the indexer starts running.
   */
  protected abstract initialize(): Promise<void>;

  private postErrorOnSlack(error: any) {
    this.alertingService
      ?.postMessageOnSlack(
        SlackMessageFormatter.formatMessage({
          header: `BaseIndexer ${this.name}`,
          messages: [
            "```" +
              JSON.stringify(
                {
                  error:
                    (error as Error).stack ||
                    (error as Error).message ||
                    (error as Error).name ||
                    "Unknown error",
                },
                undefined,
                2,
              ) +
              "```",
          ],
        }),
      )
      .catch((err) => {
        this.logger.error({
          at: "Indexer::start",
          message: "Error posting message on slack",
          error: err,
        });
      });
  }
}
