import winston from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { RepeatableTask } from "../generics";

type ResultLog = {
  task: {
    duration: number;
  };
  deposits: Array<{
    deposit: {
      depositId: string;
      originChainId: number;
      destinationChainId: number;
      status: string;
      internalHash: string | null;
      depositTxHash: string | null;
      fillDeadline: string;
      blockTimestamp: string | null;
    };
    minutesPastDeadline: number;
  }>;
  error?: {
    message: string;
    json: string;
  };
};

/**
 * @description Monitoring service that detects deposits with incorrect status after fillDeadline.
 * Queries for deposits that remain expired, unfilled, or slowFillRequested more than
 * 90 minutes after their fillDeadline. These deposits should have been either filled
 * or refunded by this point and require investigation.
 *
 * Runs on a fixed interval and logs a single structured result object at the end of each task execution.
 */
export class IncorrectDepositStatusMonitor extends RepeatableTask {
  constructor(
    logger: winston.Logger,
    private readonly postgres: DataSource,
  ) {
    super(logger, "incorrect-deposit-status-monitor");
  }

  public async taskLogic(): Promise<void> {
    const startTime = Date.now();

    // Build log object throughout execution
    const logResult: ResultLog = {
      task: {
        duration: 0,
      },
      deposits: [],
    };

    try {
      // Query for problematic deposits
      const fillDeadlineLimit = new Date(Date.now() - 90 * 60 * 1000);
      const relayHashInfos = await this.postgres
        .createQueryBuilder(entities.RelayHashInfo, "rhi")
        .innerJoinAndSelect(
          "rhi.depositEvent",
          "d",
          "rhi.depositEventId = d.id",
        )
        .select([
          "rhi.depositId",
          "rhi.originChainId",
          "rhi.destinationChainId",
          "rhi.status",
          "d.blockTimestamp",
          "rhi.fillDeadline",
          "rhi.relayHash",
          "d.transactionHash",
          "d.internalHash",
        ])
        .where("rhi.status IN (:...statuses)", {
          statuses: [
            entities.RelayStatus.Expired,
            entities.RelayStatus.Unfilled,
            entities.RelayStatus.SlowFillRequested,
          ],
        })
        .andWhere("rhi.fillDeadline <= :fillDeadlineLimit", {
          fillDeadlineLimit,
        })
        // Only look at recent deposits to test the service on a smaller time window.
        // TODO: extend the time window once we are sure the service is working as expected.
        .andWhere("d.blockTimestamp >= '2026-01-09 00:00:00'")
        .orderBy("d.blockTimestamp", "DESC")
        .limit(100)
        .getMany();

      // Build deposits array
      for (const rhi of relayHashInfos) {
        const elapsedMinutes = Math.round(
          (Date.now() - rhi.fillDeadline.getTime()) / 1000 / 60,
        );

        logResult.deposits.push({
          deposit: {
            depositId: rhi.depositId.toString(),
            originChainId: parseInt(rhi.originChainId),
            destinationChainId: parseInt(rhi.destinationChainId),
            status: rhi.status,
            internalHash: rhi.depositEvent.internalHash,
            depositTxHash: rhi.depositEvent.transactionHash,
            fillDeadline: rhi.fillDeadline.toISOString(),
            blockTimestamp:
              rhi.depositEvent.blockTimestamp?.toISOString() || null,
          },
          minutesPastDeadline: elapsedMinutes,
        });
      }
    } catch (error) {
      logResult.error = {
        message: (error as Error).message,
        json: JSON.stringify(error),
      };
    } finally {
      // Finalize task metadata
      logResult.task.duration = Date.now() - startTime;
      // Log once at the end with at and message
      if (logResult.error) {
        this.logger.error({
          at: "IncorrectDepositStatusMonitor#taskLogic",
          message: "Error checking for deposits with incorrect status",
          ...logResult,
        });
      } else if (logResult.deposits.length > 0) {
        this.logger.warn({
          at: "IncorrectDepositStatusMonitor#taskLogic",
          message: `Found ${logResult.deposits.length} deposits with incorrect status past 90-minute deadline`,
          ...logResult,
        });
      } else {
        this.logger.debug({
          at: "IncorrectDepositStatusMonitor#taskLogic",
          message: "No deposits with incorrect status found",
          ...logResult,
        });
      }
    }
  }

  protected initialize(): Promise<void> {
    this.logger.info({
      at: "IncorrectDepositStatusMonitor#initialize",
      message: "Initializing incorrect deposit status monitor service",
    });
    return Promise.resolve();
  }
}
