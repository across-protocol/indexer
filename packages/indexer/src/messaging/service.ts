import Redis from "ioredis";
import { Queue, JobsOptions } from "bullmq";

export enum IndexerQueues {}

export class IndexerQueuesService {
  // TODO: when IndexerQueues enum is no longer empty, change queues type to Record<IndexerQueues, Queue>
  private queues: Record<string, Queue> = {};

  constructor(private connection: Redis) {
    this.initializeQueues();
  }

  private initializeQueues() {
    const queueNames = Object.values(IndexerQueues);
    queueNames.forEach(
      (queueName) =>
        (this.queues[queueName] = new Queue(queueName, {
          connection: this.connection,
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
  ) {
    const q = this.queues[queue];
    if (q) {
      await q.addBulk(messages.map((m) => ({ name: jobName, data: m })));
    }
  }
}
