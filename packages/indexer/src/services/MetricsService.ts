import { client, v2 } from "@datadog/datadog-api-client";
import pRetry from "p-retry";
import { MetricIntakeType } from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2";
import {
  COUNT,
  GAUGE,
} from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";
import { Logger } from "winston";
import { DatadogConfig } from "../parseEnv";

const MAX_RETRY_TIMEOUT = 60000;
const RETRY_ATTEMPTS = 10;
const RETRY_BACKOFF_EXPONENT = 2;

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

  /**
   * Constructor for DataDogMetricsService.
   * @param {DataDogMetricsServiceConfig} config - The configuration object.
   */
  constructor(config: DataDogMetricsServiceConfig) {
    this.logger = config.logger;
    this.configuration = config.configuration;
    this.instanceTags = config.tags || [];

    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: this.configuration.dd_api_key,
        appKeyAuth: this.configuration.dd_app_key,
      },
      maxRetries: RETRY_ATTEMPTS,
      backoffBase: RETRY_BACKOFF_EXPONENT,
      backoffMultiplier: RETRY_BACKOFF_EXPONENT,
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
   */
  private async flush() {
    if (this.buffer.length === 0) return;

    const body: any = {
      body: {
        series: [...this.buffer],
      },
    };

    // Clear buffer immediately to avoid double sending if flush takes time
    this.buffer = [];

    try {
      await pRetry(
        () => {
          return this.apiInstance.submitMetrics(body);
        },
        {
          retries: RETRY_ATTEMPTS,
          factor: RETRY_BACKOFF_EXPONENT,
          maxTimeout: MAX_RETRY_TIMEOUT,
        },
      );
    } catch (error) {
      this.logger?.error({
        message: "Failed to submit metrics to Datadog after multiple retries:",
        error,
      });
    }
  }

  /**
   * Closes the metrics service.
   */
  public close() {
    clearInterval(this.flushInterval as NodeJS.Timeout);
    // Attempt one last flush
    this.flush().catch((err) =>
      console.error("Error during final metrics flush:", err),
    );
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
      if (!value) {
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
