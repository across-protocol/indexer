import { Redis } from "ioredis";
import { DataSource, entities } from "@repo/indexer-database";
import type {
  DepositParams,
  DepositsParams,
  UnfilledDepositsParams,
} from "../dtos/deposits.dto";
import {
  DepositNotFoundException,
  IncorrectQueryParamsException,
  IndexParamOutOfRangeException,
} from "./exceptions";

type APIHandler = (
  params?: JSON,
) => Promise<JSON> | JSON | never | Promise<never> | void | Promise<void>;

export class DepositsService {
  constructor(
    private db: DataSource,
    private redis: Redis,
  ) {}

  public async getDeposits(
    params: DepositsParams,
  ): Promise<entities.V3FundsDeposited[]> {
    const repo = this.db.getRepository(entities.V3FundsDeposited);
    const queryBuilder = repo
      .createQueryBuilder("deposit")
      .leftJoinAndSelect(
        entities.RelayHashInfo,
        "rhi",
        "rhi.depositEventId = deposit.id",
      )
      .select([
        `deposit.*`,
        `rhi.status as status`,
        `rhi.fillTxHash as "fillTxHash"`,
        `rhi.depositRefundTxHash as "depositRefundTxHash"`,
      ])
      .orderBy("deposit.quoteTimestamp", "DESC");

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

    if (params.originChainId) {
      queryBuilder.andWhere("deposit.originChainId = :originChainId", {
        originChainId: params.originChainId,
      });
    }

    if (params.destinationChainId) {
      queryBuilder.andWhere(
        "deposit.destinationChainId = :destinationChainId",
        {
          destinationChainId: params.destinationChainId,
        },
      );
    }

    if (params.status) {
      queryBuilder.andWhere("rhi.status = :status", {
        status: params.status,
      });
    }

    if (params.integratorId) {
      queryBuilder.andWhere("deposit.integratorId = :integratorId", {
        integratorId: params.integratorId,
      });
    }

    if (params.skip) {
      queryBuilder.skip(params.skip);
    }

    if (params.limit) {
      queryBuilder.limit(params.limit);
    }

    return queryBuilder.execute();
  }

  public async getDepositStatus(params: DepositParams) {
    // in the validation rules each of these params are marked as optional
    // but we need to check that at least one of them is present
    if (
      !(
        (params.depositId && params.originChainId) ||
        params.depositTxHash ||
        params.relayDataHash
      )
    ) {
      throw new IncorrectQueryParamsException();
    }

    // construct cache key
    const cacheKey = this.getDepositStatusCacheKey(params);
    const cachedData = await this.redis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // no cached data, so we need to query the database
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

    const matchingRelays = await queryBuilder
      .orderBy("rhi.depositEventId", "ASC")
      .getMany();
    const numberMatchingRelays = matchingRelays.length;
    if (numberMatchingRelays === 0) throw new DepositNotFoundException();
    const relay = matchingRelays[params.index];
    if (!relay) {
      throw new IndexParamOutOfRangeException(
        `Index ${params.index} out of range. Index must be between 0 and ${numberMatchingRelays - 1}`,
      );
    }

    const result = {
      status:
        relay.status === entities.RelayStatus.Unfilled
          ? "pending"
          : relay.status,
      originChainId: relay.originChainId,
      depositId: relay.depositId,
      depositTxHash: relay.depositTxHash,
      fillTx: relay.fillTxHash,
      destinationChainId: relay.destinationChainId,
      depositRefundTxHash: relay.depositRefundTxHash,
      pagination: {
        currentIndex: params.index,
        maxIndex: numberMatchingRelays - 1,
      },
    };

    if (this.shouldCacheDepositStatusResponse(relay.status)) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        this.getDepositStatusCacheTTLSeconds(relay.status),
      );
    }
    return result;
  }
  public async getUnfilledDeposits(params: UnfilledDepositsParams): Promise<
    Array<{
      originChainId: number;
      destinationChainId: number;
      originBlockNumber: number;
      originDt: number | undefined;
      originTxHash: string;
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: string;
      exclusiveRelayer: string;
      numSecondsPending: number | undefined;
    }>
  > {
    const {
      originChainId,
      destinationChainId,
      startTimestamp = Date.now() - 5 * 60 * 1000,
      endTimestamp = Date.now(),
      skip = 0,
      limit = 50,
    } = params;

    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    const repo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = repo
      .createQueryBuilder("rhi")
      .innerJoinAndSelect("rhi.depositEvent", "depositEvent")
      .where("rhi.status = :status", { status: entities.RelayStatus.Unfilled })
      .andWhere("depositEvent.blockTimestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      });

    if (originChainId) {
      queryBuilder.andWhere("depositEvent.originChainId = :originChainId", {
        originChainId,
      });
    }

    if (destinationChainId) {
      queryBuilder.andWhere(
        "depositEvent.destinationChainId = :destinationChainId",
        {
          destinationChainId,
        },
      );
    }

    queryBuilder.orderBy("depositEvent.id", "ASC").skip(skip).limit(limit);

    const results = await queryBuilder.getMany();
    return results.map((result) => {
      const depositEvent = result.depositEvent;
      return {
        originChainId: depositEvent.originChainId,
        destinationChainId: depositEvent.destinationChainId,
        originBlockNumber: depositEvent.blockNumber,
        originDt: depositEvent.blockTimestamp
          ? depositEvent.blockTimestamp.getTime()
          : undefined,
        originTxHash: depositEvent.transactionHash,
        inputTokenAddress: depositEvent.inputToken,
        outputTokenAddress: depositEvent.outputToken,
        inputAmount: depositEvent.inputAmount,
        exclusiveRelayer: depositEvent.exclusiveRelayer,
        numSecondsPending: depositEvent.blockTimestamp
          ? Math.floor(
              (Date.now() - depositEvent.blockTimestamp.getTime()) / 1000,
            )
          : undefined,
      };
    });
  }
  private getDepositStatusCacheTTLSeconds(status: entities.RelayStatus) {
    const minute = 60;
    const hour = 60 * minute;
    const day = 24 * hour;

    switch (status) {
      case entities.RelayStatus.Expired:
        return minute;
      case entities.RelayStatus.Filled:
        return day;
      case entities.RelayStatus.Refunded:
        return day;
      case entities.RelayStatus.SlowFillRequested:
        return minute * 5;
      default:
        return 0;
    }
  }

  private shouldCacheDepositStatusResponse(status: entities.RelayStatus) {
    return [
      entities.RelayStatus.Expired,
      entities.RelayStatus.Filled,
      entities.RelayStatus.Refunded,
      entities.RelayStatus.SlowFillRequested,
    ].includes(status);
  }

  private getDepositStatusCacheKey(params: DepositParams) {
    if (params.depositId && params.originChainId) {
      return `depositStatus-${params.depositId}-${params.originChainId}-${params.index}`;
    }
    if (params.depositTxHash) {
      return `depositStatus-${params.depositTxHash}-${params.index}`;
    }
    if (params.relayDataHash) {
      return `depositStatus-${params.relayDataHash}-${params.index}`;
    }

    // in theory this should never happen because we have already checked
    // that at least one of the params is present
    throw new Error(
      "Could not get deposit status: could not locate cache data",
    );
  }
}
