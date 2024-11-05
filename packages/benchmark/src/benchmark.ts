/**
 * A class to benchmark events by tracking their start and end times.
 */
import { IBenchmark } from "./types";

export class Benchmark implements IBenchmark {
  private events: Map<string, number>;

  /**
   * Initializes a new instance of the Benchmark class.
   */
  constructor() {
    this.events = new Map();
  }

  /**
   * Starts tracking an event by storing its start time.
   *
   * @param {string} eventName - The name of the event to start tracking.
   * @param {number} [now=Date.now()] - The current time in milliseconds. Defaults to the current time.
   */
  start(eventName: string, now: number = Date.now()): void {
    this.events.set(eventName, now);
  }

  /**
   * Ends tracking an event and calculates its duration.
   *
   * @param {string} eventName - The name of the event to end tracking.
   * @param {number} [now=Date.now()] - The current time in milliseconds. Defaults to the current time.
   * @returns {number | undefined} The duration of the event in milliseconds, or undefined if the event was not started.
   * @throws Will throw an error if the event was not started before calling this method.
   */
  end(eventName: string, now: number = Date.now()): number | undefined {
    const startTime = this.events.get(eventName);
    if (startTime === undefined) {
      throw new Error(
        `Benchmark for event "${eventName}" not started. Call start() before end().`,
      );
    }
    const endTime = now;
    const duration = endTime - startTime;
    this.events.delete(eventName);
    return duration;
  }
}
