import winston from "winston";

import { RepeatableTask } from "../generics";
import { DataSource, entities } from "@repo/indexer-database";
import { providers } from "@across-protocol/sdk";

import { SpokePoolProcessor } from "./spokePoolProcessor";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { IndexerQueues } from "../messaging/service";
import { IndexerQueuesService } from "../messaging/service";
import { PriceMessage } from "../messaging/priceWorker";

export class UnmatchedFillEventsService extends RepeatableTask {
  constructor(
    private readonly postgres: DataSource,
    private readonly providersFactory: RetryProvidersFactory,
    private readonly indexerQueuesService: IndexerQueuesService,
    logger: winston.Logger,
  ) {
    super(logger, UnmatchedFillEventsService.name);
  }

  protected async taskLogic() {
    try {
      const now = new Date();
      const qb = this.postgres.createQueryBuilder(
        entities.RelayHashInfo,
        "rhi",
      );

      qb.leftJoinAndMapOne(
        "rhi.fillEvent",
        entities.FilledV3Relay,
        "f",
        "f.internalHash = rhi.internalHash",
      )
        .where("rhi.status = :status", { status: "expired" })
        .andWhere("f.id is not null")
        .andWhere("f.blockTimestamp >= '2025-02-01'")
        .andWhere("now() - f.blockTimestamp > interval '5 minutes'")
        .orderBy("f.blockTimestamp", "DESC")
        .limit(100);
      const results = await qb.getMany();
      this.logger.debug({
        at: "UnmatchedFillEventsService#taskLogic",
        message: `Found ${results.length} unmatched fill events`,
      });

      for (const rhi of results) {
        await this.processUnmatchedFillEvent(rhi);
      }

      const totalTime = new Date().getTime() - now.getTime();
      this.logger.debug({
        at: "UnmatchedFillEventsService#taskLogic",
        message: `Total time: ${totalTime / 1000}s`,
      });
    } catch (error) {
      this.logger.warn({
        at: "UnmatchedFillEventsService#taskLogic",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  private async processUnmatchedFillEvent(rhi: entities.RelayHashInfo) {
    try {
      if (!rhi.fillEvent) {
        throw new Error(`Fill event not found for relay hash info ${rhi.id}`);
      }
      const spokePoolProcessor = new SpokePoolProcessor(
        this.postgres,
        rhi.destinationChainId,
        this.logger,
      );
      const transactionReceipt = await (
        this.providersFactory.getProviderForChainId(
          rhi.destinationChainId,
        ) as providers.RetryProvider
      ).getTransactionReceipt(rhi.fillEvent.transactionHash);
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [rhi.fillEvent],
        slowFillRequests: [],
        transactionReceipts: {
          [rhi.fillEvent.transactionHash]: transactionReceipt,
        },
      });
      const messages: PriceMessage[] = [{ fillEventId: rhi.fillEvent.id }];
      await this.indexerQueuesService.publishMessagesBulk(
        IndexerQueues.PriceQuery,
        IndexerQueues.PriceQuery,
        messages,
      );
    } catch (error) {
      this.logger.warn({
        at: "UnmatchedFillEventsService#processUnmatchedFillEvent",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  protected initialize() {
    return Promise.resolve();
  }
}
