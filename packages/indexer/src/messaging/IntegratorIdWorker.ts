import { providers } from "@across-protocol/sdk";
import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import winston from "winston";

import { DataSource, entities } from "@repo/indexer-database";

import { getIntegratorId } from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { IndexerQueues } from "./service";

export type IntegratorIdMessage = {
  relayHash: string;
};

/**
 * This worker listens to the `IntegratorId` queue and processes each job by:
 * - Retrieving the deposit information from the database based on the provided relay hash.
 * - Checking if the deposit record already has an integrator ID.
 * - If the integrator ID is not set, the worker fetches it from the transaction data.
 * - If found, the integrator ID is saved back into the deposit record in the database.
 */
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
        const { relayHash } = job.data;
        try {
          await this.run(relayHash);
        } catch (error) {
          this.logger.error({
            at: "IntegratorIdWorker",
            message: `Error processing job for relay hash ${relayHash}: ${error}`,
            error,
          });
          throw error;
        }
      },
      { connection: this.redis, concurrency: 10 },
    );
  }
  private async run(relayHash: string) {
    const repository = this.postgres.getRepository(entities.V3FundsDeposited);
    const deposit = await repository.findOne({
      where: { relayHash },
    });
    if (!deposit) {
      this.logger.warn({
        at: "IntegratorIdWorker",
        message: `Skipping deposit with relay hash ${relayHash}. Not found in the database.`,
      });
      return;
    }
    if (deposit.integratorId !== null) {
      this.logger.info({
        at: "IntegratorIdWorker",
        message: `Skipping deposit with relay hash ${relayHash}. IntegratorId field already populated.`,
      });
      return;
    }
    const provider = this.providerFactory.getProviderForChainId(
      parseInt(deposit.originChainId),
    );
    const integratorId = await getIntegratorId(
      provider as providers.RetryProvider,
      deposit.quoteTimestamp,
      deposit.transactionHash,
    );
    if (integratorId) {
      await repository.update({ relayHash }, { integratorId });
    }
    return;
  }
  public async close() {
    return this.worker.close();
  }
}
