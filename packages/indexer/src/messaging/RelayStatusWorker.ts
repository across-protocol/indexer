import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import { IndexerQueues } from "./service";
import { DataSource, entities } from "@repo/indexer-database";

export type RelayStatusMessage = {
  relayHash: string;
};

export class RelayStatusWorker {
  public worker: Worker;
  constructor(
    private redis: Redis,
    private postgres: DataSource,
  ) {
    this.setWorker();
  }

  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.RelayStatus,
      async (job) => {
        const { relayHash } = job.data;
        const repository = this.postgres.getRepository(entities.RelayHashInfo);
        const relayHashInfo = await repository.findOne({
          where: { relayHash },
          relations: ["depositEvent", "fillEvent", "slowFillRequestEvent"],
        });
        if (relayHashInfo) {
          const status = this.getRelayStatus(relayHashInfo);
          if (status) {
            await repository.update({ relayHash }, { status });
          }
        }
        return;
      },
      { connection: this.redis },
    );
  }

  private getRelayStatus(relayHashInfo: entities.RelayHashInfo) {
    let status: entities.RelayStatus | undefined = undefined;
    const deposit = relayHashInfo.depositEvent;
    const fill = relayHashInfo.fillEvent;
    const slowFillRequest = relayHashInfo.slowFillRequestEvent;
    if (deposit) {
      if (!fill && !slowFillRequest) {
        const now = new Date();
        status = deposit.fillDeadline < now ? "expired" : "unfilled";
      } else if (fill) {
        const fillType = fill.relayExecutionInfo.fillType;
        if (fillType === 0 || fillType === 1) {
          status = "filled";
        } else if (fillType === 2) {
          status = "slowFilled";
        }
      } else if (slowFillRequest) {
        status = "slowFillRequested";
      }
    } else if (fill && !slowFillRequest) {
      status = "filled";
    } else if (slowFillRequest && !fill) {
      status = "slowFillRequested";
    }
    return status;
  }
}
