import Redis from "ioredis";
import winston from "winston";
import { Job, Worker } from "bullmq";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import { getIntegratorId } from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

export type IntegratorIdMessage = {
  depositId: number;
  originChainId: number;
  depositQuoteTimestamp: number;
  txHash: string;
};

export class IntegratorIdWorker {
  public worker: Worker;
  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
    private providerFactory: RetryProvidersFactory,
  ) {
    this.setWorker();
  }

  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.IntegratorId,
      async (job: Job<IntegratorIdMessage>) => {
        const { depositId, originChainId, depositQuoteTimestamp, txHash } =
          job.data;
        const repository = this.postgres.getRepository(
          entities.V3FundsDeposited,
        );
        const storedDeposit = await repository.findOne({
          where: { depositId, originChainId, transactionHash: txHash },
        });
        if (!storedDeposit) {
          this.logger.warn({
            at: "IntegratorIdWorker",
            message: `Skipping deposit with id ${depositId}, origin chain ${originChainId} and tx hash ${txHash}. Not found in the database.`,
          });
          throw new Error("Deposit not found");
        }
        const provider =
          this.providerFactory.getProviderForChainId(originChainId);
        const integratorId = await getIntegratorId(
          provider,
          depositQuoteTimestamp,
          txHash,
        );
        if (integratorId) {
          await repository.update(
            { depositId, originChainId, transactionHash: txHash },
            { integratorId },
          );
        }
        return;
      },
      { connection: this.redis, concurrency: 10 },
    );
  }
}
