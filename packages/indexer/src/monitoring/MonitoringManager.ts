import winston, { Logger } from "winston";
import { DataSource } from "@repo/indexer-database";
import { Config } from "../parseEnv";
import { IncorrectDepositStatusMonitor } from "./IncorrectDepositStatusMonitor";

export enum MonitoringServices {
  IncorrectDepositStatus = "incorrect-deposit-status-monitor",
}

export const INCORRECT_DEPOSIT_STATUS_MONITOR_DELAY_SECONDS = 60;

/**
 * @description Manager for all monitoring services in the indexer.
 * Orchestrates lifecycle (start/stop) of monitoring services that detect
 * and log anomalies or issues requiring investigation.
 *
 * This manager can be extended to add more monitoring services in the future.
 */
export class MonitoringManager {
  private incorrectDepositStatusMonitor?: IncorrectDepositStatusMonitor;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
  ) {}

  public async start() {
    return Promise.all([this.startIncorrectDepositStatusMonitor()]);
  }

  public async stopGracefully() {
    this.incorrectDepositStatusMonitor?.stop();
  }

  private async startIncorrectDepositStatusMonitor() {
    if (
      !this.config.enabledMonitors.includes(
        MonitoringServices.IncorrectDepositStatus,
      )
    ) {
      this.logger.warn({
        at: "MonitoringServicesManager#startIncorrectDepositStatusMonitor",
        message: "Incorrect deposit status monitor is disabled",
      });
      return;
    }

    this.incorrectDepositStatusMonitor = new IncorrectDepositStatusMonitor(
      this.logger,
      this.postgres,
    );

    return this.incorrectDepositStatusMonitor.start(
      INCORRECT_DEPOSIT_STATUS_MONITOR_DELAY_SECONDS,
    );
  }
}
