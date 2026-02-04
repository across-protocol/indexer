import { client, v2 } from "@datadog/datadog-api-client";
import pRetry from "p-retry";
import { MetricIntakeType } from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2";
import {
  COUNT,
  GAUGE,
} from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";
import { Logger } from "winston";
import { DatadogConfig } from "../parseEnv";

/**
 * Configuration for DataDogMetricsService.
 * @interface
 * @property {DatadogConfig} configuration - The Datadog configuration.
 * @property {Logger} logger - The logger to use for logging.
 */
export interface DataDogMetricsServiceConfig {
  configuration: DatadogConfig;
  logger: Logger;
  tags?: string[];
}

/**
 * Service for submitting metrics to Datadog.
 * The metrics service is a singleton that is used to submit metrics to Datadog.
 * It is initialized in the main process and is used by all indexers.
 * The metrics are submitted in batches to avoid too many requests to Datadog and are submitted every 10 seconds or when the buffer is full.
 *
 * @class
 * @property {v2.MetricsApi} apiInstance - The Datadog metrics API instance.
 * @property {v2.MetricSeries[]} buffer - The buffer of metrics to submit.
 * @property {NodeJS.Timeout} flushInterval - The interval for flushing metrics.
 * @property {number} MAX_BUFFER_SIZE - The maximum buffer size.
 * @property {number} FLUSH_INTERVAL_MS - The flush interval in milliseconds.
 * @property {string[]} globalTags - The global tags to apply to all metrics.
 * @property {boolean} enabled - Whether the metrics service is enabled.
 */
export class DataDogMetricsService {
  private apiInstance: v2.MetricsApi;
  private buffer: v2.MetricSeries[] = [];
  private flushInterval: ReturnType<typeof setInterval>;
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 10000;
  private configuration: DatadogConfig;
  private logger?: Logger;
  private instanceTags: string[] = [];
  private abortController: AbortController;

  /**
   * Constructor for DataDogMetricsService.
   * @param {DataDogMetricsServiceConfig} config - The configuration object.
   */
  constructor(config: DataDogMetricsServiceConfig) {
    this.logger = config.logger;
    this.configuration = config.configuration;
    this.instanceTags = config.tags || [];
    this.abortController = new AbortController();
    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: this.configuration.dd_api_key,
        appKeyAuth: this.configuration.dd_app_key,
      },
      httpConfig: {
        signal: this.abortController.signal as any,
      },
    });

    this.apiInstance = new v2.MetricsApi(configuration);
    this.logger?.debug({
      message: "DataDogMetricsService initialized",
      enabled: this.configuration.enabled,
    });
    // Periodically flush metrics
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Adds a gauge metric to the buffer.
   * @param {string} metricName - The name of the metric.
   * @param {number} value - The value of the metric.
   * @param {string[]} tags - The tags to apply to the metric.
   */
  public addGaugeMetric(metricName: string, value: number, tags: string[]) {
    this.addMetric(metricName, value, tags, GAUGE);
  }

  /**
   * Adds a count metric to the buffer.
   * @param {string} metricName - The name of the metric.
   * @param {string[]} tags - The tags to apply to the metric.
   * @param {number} value - The value of the metric.
   */
  public addCountMetric(metricName: string, tags: string[], value: number = 1) {
    this.addMetric(metricName, value, tags, COUNT);
  }

  /**
   * Adds a metric to the buffer.
   * @param {string} metricName - The name of the metric.
   * @param {number} value - The value of the metric.
   * @param {string[]} tags - The tags to apply to the metric.
   * @param {MetricIntakeType} type - The type of the metric.
   */
  public addMetric(
    metricName: string,
    value: number,
    tags: string[],
    type: MetricIntakeType,
  ) {
    if (!this.configuration.enabled) return;

    const allTags = [
      ...this.configuration.globalTags,
      ...this.instanceTags,
      ...tags,
    ];

    this.buffer.push({
      metric: metricName,
      type,
      points: [
        {
          timestamp: Math.round(Date.now() / 1000),
          value: value,
        },
      ],
      tags: allTags,
    });

    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * Flushes the buffer of metrics to Datadog.
   * Uses serialized execution to ensure only one flush is active at a time.
   */
  private async flush() {
    if (this.buffer.length === 0) return;

    const body: any = {
      body: {
        series: [...this.buffer],
      },
    };

    // Clear buffer immediately to avoid double sending
    this.buffer = [];

    try {
      // Uses p-retry with default settings:
      // 10 retries, factor 2, 1000ms minTimeout, Infinity maxTimeout
      await pRetry(() => {
        // Signal allows us to kill the specific HTTPS request on shutdown
        return this.apiInstance.submitMetrics(body);
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        this.logger?.debug({
          at: "MetricsService.flush",
          message: "Datadog flush aborted during shutdown.",
        });
      } else {
        this.logger?.error({
          at: "MetricsService.flush",
          message:
            "Failed to submit metrics to Datadog after multiple retries:",
          error,
        });
      }
    }
  }

  /**
   * Closes the metrics service.
   * Immediately terminates in-flight network requests to allow natural process exit.
   */
  public async close() {
    this.logger?.debug({
      at: "MetricsService.close",
      message:
        "Datadog Metrics Service: Closing and killing in-flight requests.",
    });

    // Stop the recurring flush timer
    clearInterval(this.flushInterval as NodeJS.Timeout);
    this.abortController.abort();
  }
}

/**
 * Arguments for the withMetrics wrapper.
 */
interface WithMetricsArgs {
  service?: DataDogMetricsService;
  metricName: string;
  tags: string[];
  type: MetricIntakeType;
  value?: number;
  logger: Logger;
}

/**
 * Wraps a function with metrics reporting.
 * @param {Function} fn - The function to wrap.
 * @param {WithMetricsArgs} args - Arguments for the metric.
 * @returns {Function} The wrapped function.
 */
export const withMetrics = <TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  args: WithMetricsArgs,
): ((...args: TArgs) => Promise<TReturn>) => {
  return async (...argsInput: TArgs) => {
    const result = await fn(...argsInput);
    const { service, metricName, tags, type, value, logger } = args;

    if (!service) return result;

    if (type === COUNT) {
      service.addCountMetric(metricName, tags, value ?? 1);
    }
    if (type === GAUGE) {
      if (value === undefined) {
        logger.warn({
          message: "Value is required for gauge metrics",
          metricName,
          tags,
        });
        return result;
      }
      service.addGaugeMetric(metricName, value, tags);
    }

    return result;
  };
};
