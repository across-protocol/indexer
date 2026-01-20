import winston from "winston";

import { DataSource, entities } from "@repo/indexer-database";

import { RepeatableTask } from "../generics";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

import { SpokePoolProcessor } from "./spokePoolProcessor";

export class UnmatchedDepositEventsService extends RepeatableTask {
  constructor(
    private readonly postgres: DataSource,
    private readonly providersFactory: RetryProvidersFactory,
    logger: winston.Logger,
  ) {
    super(logger, UnmatchedDepositEventsService.name);
  }

  protected async taskLogic() {
    try {
      const now = new Date();
      const qb = this.postgres.createQueryBuilder(
        entities.V3FundsDeposited,
        "d",
      );

      qb.leftJoinAndMapOne(
        "d.relayHashInfo",
        entities.RelayHashInfo,
        "rhi",
        "d.id = rhi.depositEventId",
      )
        .where("rhi.depositEventId is null")
        .andWhere("d.finalised = true")
        .andWhere("now() - d.blockTimestamp > interval '5 minutes'")
        .andWhere("d.blockTimestamp >= '2025-02-01'")
        .orderBy("d.id", "DESC")
        .limit(100);
      const results = await qb.getMany();
      this.logger.debug({
        at: "UnmatchedDepositEventsService#taskLogic",
        message: `Found ${results.length} unmatched deposit events`,
      });

      for (const deposit of results) {
        await this.processUnmatchedDepositEvent(deposit);
      }

      const totalTime = new Date().getTime() - now.getTime();
      this.logger.debug({
        at: "UnmatchedDepositEventsService#taskLogic",
        message: `Total time: ${totalTime / 1000}s`,
      });
    } catch (error) {
      this.logger.warn({
        at: "UnmatchedDepositEventsService#taskLogic",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  private async processUnmatchedDepositEvent(
    deposit: entities.V3FundsDeposited,
  ) {
    this.logger.debug({
      at: "UnmatchedDepositEventsService#processUnmatchedDepositEvent",
      message: `Found deposit ${deposit.id} internalHash ${deposit.internalHash} with unmatched RelayHashInfo`,
    });
    try {
      const spokePoolProcessor = new SpokePoolProcessor(
        this.postgres,
        parseInt(deposit.originChainId),
        this.logger,
      );
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [deposit],
        fills: [],
        slowFillRequests: [],
      });
    } catch (error) {
      this.logger.warn({
        at: "UnmatchedDepositEventsService#processUnmatchedDepositEvent",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  protected initialize() {
    return Promise.resolve();
  }
}
