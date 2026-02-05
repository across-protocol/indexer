import winston from "winston";
import { RepeatableTask } from "../generics";
import { DataSource, entities } from "@repo/indexer-database";

type DepositInfo = {
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
  // For expired deposits: minutes past fillDeadline
  // For unfilled deposits: minutes since deposit was created
  minutesElapsed: number;
};

type ResultLog = {
  task: {
    duration: number;
  };
  oldExpiredDeposits: Array<DepositInfo>;
  recentUnfilledDeposits: Array<DepositInfo>;
  error?: {
    message: string;
    json: string;
  };
};

/**
 * @description Monitoring service that detects deposits with incorrect status.
 *
 * Detects two categories of problematic deposits:
 * 1. Old Expired: Deposits with Expired status that are 90+ minutes past fillDeadline.
 *    These should have been either refunded or filled by now.
 * 2. Recent Unfilled: Deposits with Unfilled or SlowFillRequested status that were created
 *    5+ minutes ago (based on blockTimestamp) AND have no message (simple bridges).
 *    These should fill quickly since they don't require complex message execution.
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
      oldExpiredDeposits: [],
      recentUnfilledDeposits: [],
    };

    try {
      // Query 1: Expired deposits (90+ minutes past fill deadline)
      const expiredFillDeadlineLimit = new Date(Date.now() - 90 * 60 * 1000);
      const expiredDeposits = await this.postgres
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
        .where("rhi.status = :status", {
          status: entities.RelayStatus.Expired,
        })
        .andWhere("rhi.fillDeadline <= :fillDeadlineLimit", {
          fillDeadlineLimit: expiredFillDeadlineLimit,
        })
        // Exclude deposits with inputAmount = 0 as they will legitimately remain expired
        .andWhere("d.inputAmount != '0'")
        // Only look at recent deposits to test the service on a smaller time window.
        // TODO: extend the time window once we are sure the service is working as expected.
        .andWhere("d.blockTimestamp >= '2026-01-09 00:00:00'")
        .orderBy("d.blockTimestamp", "DESC")
        .limit(100)
        .getMany();

      // Query 2: Unfilled/SlowFillRequested deposits (created 5+ minutes ago, no message)
      const unfilledBlockTimestampLimit = new Date(Date.now() - 5 * 60 * 1000);
      const unfilledDeposits = await this.postgres
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
            entities.RelayStatus.Unfilled,
            entities.RelayStatus.SlowFillRequested,
          ],
        })
        // Deposit was created 5+ minutes ago (based on block timestamp)
        .andWhere("d.blockTimestamp <= :blockTimestampLimit", {
          blockTimestampLimit: unfilledBlockTimestampLimit,
        })
        // Only include deposits with no message (empty message means simple bridge, should fill quickly)
        .andWhere("(d.message IS NULL OR d.message = '' OR d.message = '0x')")
        // Exclude deposits with inputAmount = 0 as they will legitimately remain unfilled
        .andWhere("d.inputAmount != '0'")
        .orderBy("d.blockTimestamp", "DESC")
        .limit(100)
        .getMany();

      // Process expired deposits (elapsed = minutes past fillDeadline)
      for (const rhi of expiredDeposits) {
        const minutesPastDeadline = Math.round(
          (Date.now() - rhi.fillDeadline.getTime()) / 1000 / 60,
        );

        logResult.oldExpiredDeposits.push({
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
          minutesElapsed: minutesPastDeadline,
        });
      }

      // Process unfilled/slowFillRequested deposits (elapsed = minutes since deposit created)
      for (const rhi of unfilledDeposits) {
        const minutesSinceDeposit = rhi.depositEvent.blockTimestamp
          ? Math.round(
              (Date.now() - rhi.depositEvent.blockTimestamp.getTime()) /
                1000 /
                60,
            )
          : 0;

        logResult.recentUnfilledDeposits.push({
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
          minutesElapsed: minutesSinceDeposit,
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
      } else if (
        logResult.oldExpiredDeposits.length > 0 ||
        logResult.recentUnfilledDeposits.length > 0
      ) {
        this.logger.warn({
          at: "IncorrectDepositStatusMonitor#taskLogic",
          message: `Found ${logResult.oldExpiredDeposits.length} old expired (90+ min past deadline) and ${logResult.recentUnfilledDeposits.length} recent unfilled (created 5+ min ago, no message) deposits`,
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
