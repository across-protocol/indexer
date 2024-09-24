import { JSON } from "../types";
import { DataSource, entities } from "@repo/indexer-database";
import type { DepositParams, DepositsParams } from "../controllers";
import {
  DepositNotFoundException,
  IndexParamOutOfRangeException,
} from "../common/exceptions";

type APIHandler = (
  params?: JSON,
) => Promise<JSON> | JSON | never | Promise<never> | void | Promise<void>;

export class IndexerService {
  constructor(private db: DataSource) {}

  public async getDeposits(
    params: DepositsParams,
  ): Promise<entities.V3FundsDeposited[]> {
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
        originChainId: relay?.originChainId,
        depositTxHash: relay?.depositTxHash,
        fillTxHash: relay?.fillTxHash,
        destinationChainId: relay?.destinationChainId,
        depositRefundTxHash: relay?.depositRefundTxHash,
        pagination: {
          currentIndex: params.index,
          maxIndex: numberMatchingRelays - 1,
        },
      };
      return result;
    } else {
      throw new IndexParamOutOfRangeException(
        `Index ${params.index} out of range. Index must be between 0 and ${numberMatchingRelays - 1}`,
      );
    }
  }
}
