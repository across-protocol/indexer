import { Benchmark } from "./benchmark";

import { IBenchmark } from "./types";

export class BenchmarkStats implements IBenchmark {
  private benchmark: Benchmark;
  private eventDurations: Map<string, number>;

  constructor(benchmark: Benchmark = new Benchmark()) {
    this.benchmark = benchmark;
    this.eventDurations = new Map();
  }

  /**
   * Starts a new benchmark event.
   * @param {string} eventName - The name of the event to start.
   */
  start(eventName: string, now: number = Date.now()): void {
    this.benchmark.start(eventName, now);
  }

  /**
   * Ends a benchmark event and records its duration.
   * @param {string} eventName - The name of the event to stop.
   * @returns {number | undefined} The duration of the event in milliseconds, or undefined if the event was not started.
   */
  end(eventName: string, now: number = Date.now()): number | undefined {
    const duration = this.benchmark.end(eventName, now);
    if (duration !== undefined) {
      this.eventDurations.set(eventName, duration);
    }
    return duration;
  }

  /**
   * Provides statistics about the currently tracked events.
   *
   * @returns {object} An object containing statistics about the events.
   */
  getStats(): {
    total: number;
    oldest: number | null;
    newest: number | null;
    average: number | null;
    fastest: number | null;
    slowest: number | null;
  } {
    const total = this.eventDurations.size;

    if (total === 0) {
      return {
        total,
        oldest: null,
        newest: null,
        average: null,
        fastest: null,
        slowest: null,
      };
    }

    let oldest = Number.MAX_VALUE;
    let newest = Number.MIN_VALUE;
    let totalDuration = 0;
    let fastest = Number.MAX_VALUE;
    let slowest = Number.MIN_VALUE;

    for (const duration of this.eventDurations.values()) {
      totalDuration += duration;
      if (duration < fastest) fastest = duration;
      if (duration > slowest) slowest = duration;
      if (duration < oldest) oldest = duration;
      if (duration > newest) newest = duration;
    }

    const average = totalDuration / total;

    return {
      total,
      oldest,
      newest,
      average,
      fastest,
      slowest,
    };
  }
}
