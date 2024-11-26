import Redis from "ioredis";
import { Queue, JobsOptions, BulkJobOptions } from "bullmq";

export enum WebhooksQueues {
  WebhookRequest = "WebhookRequest",
}

export class WebhooksQueuesService {
  private queues = {} as Record<WebhooksQueues, Queue>;

  constructor(private connection: Redis) {
    this.initializeQueues();
  }

  private initializeQueues() {
    const queueNames = Object.values(WebhooksQueues);
    queueNames.forEach(
      (queueName) =>
        (this.queues[queueName] = new Queue(queueName, {
          connection: this.connection,
          defaultJobOptions: {
            attempts: Number.MAX_SAFE_INTEGER,
            removeOnComplete: true,
          },
        })),
    );
  }

  public async publishMessage<T>(
    queue: WebhooksQueues,
    message: T,
    options: JobsOptions = {},
  ) {
    const q = this.queues[queue];
    if (q) {
      await q.add(queue, message, options);
    }
  }

  public async publishMessagesBulk<T>(
    queue: WebhooksQueues,
    jobName: string,
    messages: T[],
    options: BulkJobOptions = {},
  ) {
    const q = this.queues[queue];
    if (q) {
      await q.addBulk(
        messages.map((m) => ({ name: jobName, data: m, opts: options })),
      );
    }
  }
}
