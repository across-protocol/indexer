import Redis from "ioredis";
import winston from "winston";
import { Job, Worker } from "bullmq";

import { DataSource, entities } from "@repo/indexer-database";

import { WebhooksQueues } from "./WebhooksQueuesService";
import { WebhookTypes } from "../../factory";
import { WebhookWriteFn } from "../../eventProcessorManager";

export type WebhookRequestQueueJob = {
  webhookRequestId: string;
  depositTxHash: string;
  originChainId: number;
};

export class WebhookRequestWorker {
  public worker: Worker;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
    private webhookWriteFn: WebhookWriteFn,
  ) {
    this.setWorker();
  }

  public setWorker() {
    this.worker = new Worker(
      WebhooksQueues.WebhookRequest,
      async (job: Job<WebhookRequestQueueJob>) => {
        try {
          this.logger.debug({
            at: "WebhookRequestWorker",
            message: `Processing job for webhook request ${job.data.webhookRequestId}`,
          });
          await this.run(job.data);
        } catch (error) {
          this.logger.error({
            at: "WebhookRequestWorker",
            message: `Error processing job for webhook request ${job.data.webhookRequestId}`,
            error,
          });
          throw error;
        }
      },
      { connection: this.redis, concurrency: 10 },
    );
  }

  private async run(webhookRequestJob: WebhookRequestQueueJob) {
    const { depositTxHash, originChainId } = webhookRequestJob;
    const relayHashInfo = await this.postgres
      .getRepository(entities.RelayHashInfo)
      .findOne({
        where: {
          depositTxHash,
          originChainId,
        },
      });
    if (!relayHashInfo) {
      this.logger.warn({
        at: "WebhookRequestWorker",
        message: `Relay hash info not found for webhook request ${webhookRequestJob.webhookRequestId}`,
        webhookRequestJob,
      });
      return;
    }
    this.webhookWriteFn({
      type: WebhookTypes.DepositStatus,
      event: {
        originChainId: relayHashInfo.originChainId,
        depositTxHash: relayHashInfo.depositTxHash,
        depositId: relayHashInfo.depositId,
        status: relayHashInfo.status,
      },
    });
  }

  public async close() {
    return this.worker.close();
  }
}
