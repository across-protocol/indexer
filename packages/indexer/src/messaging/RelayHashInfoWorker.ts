import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import { IndexerQueues, IndexerQueuesService } from "./service";
import { DataSource, entities } from "@repo/indexer-database";

export type RelayHashInfoMessage = {
  relayHash: string;
  eventType: "V3FundsDeposited" | "FilledV3Relay" | "RequestedV3SlowFill";
  eventId: number;
  depositId: number;
  originChainId: number;
};

export class RelayHashInfoWorker {
  public worker: Worker;
  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private indexerQueuesService: IndexerQueuesService,
  ) {
    this.setWorker();
  }

  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.RelayHashInfo,
      async (job: Job<RelayHashInfoMessage>) => {
        const { relayHash, depositId, originChainId, eventType, eventId } =
          job.data;
        const repository = this.postgres.getRepository(entities.RelayHashInfo);
        const eventTypeToField = {
          V3FundsDeposited: "depositEvent",
          FilledV3Relay: "fillEvent",
          RequestedV3SlowFill: "requestSlowFillEvent",
        };
        const eventField = eventTypeToField[eventType];
        await repository.upsert(
          { relayHash, depositId, originChainId, [eventField]: eventId },
          ["relayHash"],
        );
        await this.indexerQueuesService.publishMessage(
          IndexerQueues.RelayStatus,
          IndexerQueues.RelayStatus, // use queue name as job name
          { relayHash },
        );
        return;
      },
      { connection: this.redis },
    );
  }
}
