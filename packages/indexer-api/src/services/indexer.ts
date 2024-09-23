import { JSON } from "../types";
import { DataSource, entities } from "@repo/indexer-database";
import type { DepositParams, DepositsParams } from "../controllers";
import { DepositNotFoundException } from "../common/exceptions";

type APIHandler = (
  params?: JSON,
) => Promise<JSON> | JSON | never | Promise<never> | void | Promise<void>;

export class IndexerService {
  constructor(private db: DataSource) {}

  public async getDeposits(params: DepositsParams) {
    const repo = this.db.getRepository(entities.V3FundsDeposited);
    const queryBuilder = repo.createQueryBuilder("deposit");

    if (params.depositor) {
      queryBuilder.andWhere("deposit.depositor = :depositor", {
        depositor: params.depositor,
      });
    }

    if (params.recipient) {
      queryBuilder.andWhere("deposit.recipient = :recipient", {
        recipient: params.recipient,
      });
    }

    if (params.inputToken) {
      queryBuilder.andWhere("deposit.inputToken = :inputToken", {
        inputToken: params.inputToken,
      });
    }

    if (params.outputToken) {
      queryBuilder.andWhere("deposit.outputToken = :outputToken", {
        outputToken: params.outputToken,
      });
    }

    if (params.skip) {
      queryBuilder.skip(params.skip);
    }

    if (params.limit) {
      // using take rather than limit
      queryBuilder.take(params.limit);
    }

    return queryBuilder.getMany();
  }

  public async getDepositStatus(params: DepositParams) {
    const repo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = repo.createQueryBuilder("rhi");

    if (params.depositId && params.originChainId) {
      queryBuilder.andWhere(
        "rhi.depositId = :depositId AND rhi.originChainId = :originChainId",
        {
          depositId: params.depositId,
          originChainId: params.originChainId,
        },
      );
    }

    if (params.depositTxHash) {
      queryBuilder.andWhere("rhi.depositTxHash = :depositTxHash", {
        depositTxHash: params.depositTxHash,
      });
    }

    if (params.relayDataHash) {
      queryBuilder.andWhere("rhi.relayHash = :relayDataHash", {
        relayDataHash: params.relayDataHash,
      });
    }

    const matchingRelays = await queryBuilder.getMany();
    const numberMatchingRelays = matchingRelays.length;
    if (numberMatchingRelays === 0) throw new DepositNotFoundException();
    if (params.index < numberMatchingRelays) {
      const relay = matchingRelays[params.index];
      const result = {
        status: relay?.status,
        depositTxHash: relay?.depositTxHash,
        fillTxHash: relay?.fillTxHash,
        depositRefundTxHash: relay?.depositRefundTxHash,
        currentIndex: params.index,
        lastIndex: numberMatchingRelays - 1,
      };
      return result;
    } else {
      throw new Error("Index out of range");
    }
  }
}
