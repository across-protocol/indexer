import { providers, utils } from "@across-protocol/sdk";
import { Signature } from "@solana/kit";
import winston from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { RepeatableTask } from "../generics";
import { PriceMessage } from "../messaging/priceWorker";
import { IndexerQueues } from "../messaging/service";
import { IndexerQueuesService } from "../messaging/service";
import {
  RetryProvidersFactory,
  SvmProvider,
} from "../web3/RetryProvidersFactory";
import { SpokePoolProcessor } from "./spokePoolProcessor";

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
      const qb = this.postgres.createQueryBuilder(entities.FilledV3Relay, "f");

      qb.leftJoinAndMapOne(
        "f.relayHashInfo",
        entities.RelayHashInfo,
        "rhi",
        "f.id = rhi.fillEventId",
      )
        .where("rhi.fillEventId is null")
        .andWhere("f.finalised = true")
        .andWhere("now() - f.blockTimestamp > interval '5 minutes'")
        .andWhere("f.blockTimestamp >= '2025-02-01'")
        .orderBy("f.id", "DESC")
        .limit(100);
      const results = await qb.getMany();

      this.logger.debug({
        at: "UnmatchedFillEventsService#taskLogic",
        message: `Found ${results.length} unmatched fill events`,
      });

      for (const fill of results) {
        await this.processUnmatchedFillEvent(fill);
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

  private async processUnmatchedFillEvent(fill: entities.FilledV3Relay) {
    this.logger.debug({
      at: "UnmatchedFillEventsService#processUnmatchedFillEvent",
      message: `Found fill ${fill.id} internalHash ${fill.internalHash} with unmatched RelayHashInfo`,
    });
    try {
      const spokePoolProcessor = new SpokePoolProcessor(
        this.postgres,
        parseInt(fill.destinationChainId),
        this.logger,
      );

      let fillsGasFee: Record<string, bigint | undefined>;

      if (utils.chainIsSvm(Number(fill.destinationChainId))) {
        const provider = this.providersFactory.getProviderForChainId(
          parseInt(fill.destinationChainId),
        ) as SvmProvider;
        const transaction = await provider
          .getTransaction(fill.transactionHash as Signature, {
            maxSupportedTransactionVersion: 0,
            encoding: "json",
          })
          .send();
        fillsGasFee = {
          [fill.transactionHash]: !!transaction?.meta?.fee
            ? BigInt(transaction.meta.fee.toString())
            : undefined,
        };
      } else {
        const provider = this.providersFactory.getProviderForChainId(
          parseInt(fill.destinationChainId),
        ) as providers.RetryProvider;
        const transactionReceipt = await provider.getTransactionReceipt(
          fill.transactionHash,
        );
        fillsGasFee = {
          [fill.transactionHash]: transactionReceipt.gasUsed
            .mul(transactionReceipt.effectiveGasPrice)
            .toBigInt(),
        };
      }
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [fill],
        slowFillRequests: [],
        fillsGasFee,
      });
      const messages: PriceMessage[] = [{ fillEventId: fill.id }];
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
