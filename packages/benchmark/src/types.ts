export interface IBenchmark {
  /**
   * Starts tracking an event by storing its start time.
   *
   * @param {string} eventName - The name of the event to start tracking.
   * @param {number} [now=Date.now()] - The current time in milliseconds. Defaults to the current time.
   */
  start(eventName: string, now?: number): void;

  /**
   * Ends tracking an event and calculates its duration.
   *
   * @param {string} eventName - The name of the event to end tracking.
   * @param {number} [now=Date.now()] - The current time in milliseconds. Defaults to the current time.
   * @returns {number | undefined} The duration of the event in milliseconds, or undefined if the event was not started.
   * @throws Will throw an error if the event was not started before calling this method.
   */
  end(eventName: string, now?: number): number | undefined;
}
