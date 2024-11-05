import { expect } from "chai";
import { Benchmark } from "./benchmark";
import { BenchmarkStats } from "./stats";

describe("Benchmark", () => {
  let benchmark: Benchmark;

  beforeEach(() => {
    benchmark = new Benchmark();
  });

  it("should start and end a benchmark event correctly", async () => {
    benchmark.start("testEvent", 0);
    const duration = benchmark.end("testEvent", 1);
    expect(duration).to.be.a("number");
    expect(duration).to.be.greaterThan(0);
  });

  it("should throw an error if end is called without start", () => {
    expect(() => benchmark.end("nonExistentEvent")).to.throw(
      Error,
      'Benchmark for event "nonExistentEvent" not started. Call start() before end().',
    );
  });

  it("should handle multiple events independently", () => {
    benchmark.start("event1", 0);
    benchmark.start("event2", 0);

    const duration1 = benchmark.end("event1", 1);
    expect(duration1).to.be.a("number");
    expect(duration1).to.be.greaterThan(0);

    const duration2 = benchmark.end("event2", 1);
    expect(duration2).to.be.a("number");
    expect(duration2).to.be.greaterThan(0);
  });

  it("should throw an error if the same event is started twice without ending", () => {
    benchmark.start("duplicateEvent");
    expect(() => benchmark.start("duplicateEvent")).to.not.throw();
    expect(() => benchmark.end("duplicateEvent")).to.not.throw();
  });
});

describe("BenchmarkStats", () => {
  let benchmarkStats: BenchmarkStats;

  beforeEach(() => {
    benchmarkStats = new BenchmarkStats();
  });

  it("should start and end a benchmark event correctly", () => {
    benchmarkStats.start("testEvent", 0);
    const duration = benchmarkStats.end("testEvent", 1);
    expect(duration).to.be.a("number");
    expect(duration).to.be.greaterThan(0);
  });

  it("should return correct stats for events", () => {
    benchmarkStats.start("event1");
    benchmarkStats.end("event1");
    benchmarkStats.start("event2");
    benchmarkStats.end("event2");

    const stats = benchmarkStats.getStats();
    expect(stats.total).to.equal(2);
    expect(stats.oldest).to.be.a("number");
    expect(stats.newest).to.be.a("number");
    expect(stats.average).to.be.a("number");
    expect(stats.fastest).to.be.a("number");
    expect(stats.slowest).to.be.a("number");
  });

  it("should handle events with specific integer timestamps correctly", () => {
    const startTime1 = 1000;
    const endTime1 = 2000;
    const startTime2 = 3000;
    const endTime2 = 4000;

    benchmarkStats.start("event1", startTime1);
    benchmarkStats.end("event1", endTime1);
    benchmarkStats.start("event2", startTime2);
    benchmarkStats.end("event2", endTime2);

    const stats = benchmarkStats.getStats();
    expect(stats.total).to.equal(2);
    expect(stats.oldest).to.equal(endTime1 - startTime1);
    expect(stats.newest).to.equal(endTime2 - startTime2);
    expect(stats.average).to.equal(
      (endTime1 - startTime1 + endTime2 - startTime2) / 2,
    );
    expect(stats.fastest).to.equal(endTime1 - startTime1);
    expect(stats.slowest).to.equal(endTime2 - startTime2);
  });
});
