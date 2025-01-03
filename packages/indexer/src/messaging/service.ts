import Redis from "ioredis";
import { Queue, JobsOptions, BulkJobOptions } from "bullmq";

export enum IndexerQueues {
  IntegratorId = "IntegratorId",
  PriceQuery = "PriceQuery",
  SwapMessage = "SwapMessage",
}

export class IndexerQueuesService {
  private queues = {} as Record<IndexerQueues, Queue>;

  constructor(private connection: Redis) {
    this.initializeQueues();
  }

  private initializeQueues() {
    const queueNames = Object.values(IndexerQueues);
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
    queue: IndexerQueues,
    jobName: string,
    message: T,
    options: JobsOptions = {},
  ) {
    const q = this.queues[queue];
    if (q) {
      await q.add(jobName, message, options);
    }
  }

  public async publishMessagesBulk<T>(
    queue: IndexerQueues,
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
