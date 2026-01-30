import winston from "winston";
import { delayWithAbort } from "../utils";

/**
 * Base class to be implemented by tasks that need to be run repeatedly.
 */
export abstract class RepeatableTask {
  constructor(
    protected readonly logger: winston.Logger,
    private readonly name: string,
  ) {
    this.logger.debug({
      at: "RepeatableTask#constructor",
      message: `Instantiated task ${name}`,
    });
  }

  /**
   * Initiates the task to start running.
   * @dev This method calls the `taskLogic` method in a loop with a delay between each iteration.
   * @dev This method calls the `initialize` method before starting the loop to allow for any setup that needs to be done before the task starts.
   * @dev You can stop the task by calling the `stop` method. This will set a flag that the task should stop at the next opportunity.
   * @param delay The delay in seconds between each iteration of the task
   * @param signal An optional AbortSignal to allow for graceful shutdown of the task.
   */
  public async start(delay: number, signal: AbortSignal): Promise<void> {
    this.logger.debug({
      at: "RepeatableTask#start",
      message: `Starting task ${this.name}`,
    });

    try {
      // Initialize the task before starting the loop
      await this.initialize();
    } catch (e) {
      this.logger.error({
        at: "RepeatableTask#start",
        message: `Failed to initialize ${this.name}`,
        notificationPath: "across-indexer-error",
        error: (e as unknown as Error).message,
      });
      return;
    }

    do {
      await this.taskLogic();
      await delayWithAbort(delay, signal);
    } while (!signal.aborted);

    this.logger.debug({
      at: "RepeatableTask#start",
      message: `Ended halted ${this.name}`,
    });
  }

  /**
   * The main logic of the task. This method should be implemented by the child class and is expected to be run within the context of a loop.
   */
  protected abstract taskLogic(): Promise<void>;

  /**
   * The initialization logic of the task. This method should be implemented by the child class and is expected to be run before the task starts running.
   */
  protected abstract initialize(): Promise<void>;
}
