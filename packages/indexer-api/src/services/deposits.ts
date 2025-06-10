import { Redis } from "ioredis";
import { DataSource, entities } from "@repo/indexer-database";
import type {
  DepositParams,
  DepositsParams,
  FilterDepositsParams,
  DepositReturnType,
  ParsedDepositReturnType,
  DepositStatusResponse,
} from "../dtos/deposits.dto";
import {
  DepositNotFoundException,
  IncorrectQueryParamsException,
  IndexParamOutOfRangeException,
} from "./exceptions";

type APIHandler = (
  params?: JSON,
) => Promise<JSON> | JSON | never | Promise<never> | void | Promise<void>;
// use in typeorm select statement to match DepositReturnType
const DepositFields = [
  `deposit.id as "id"`,
  `deposit.relayHash as "relayHash"`,
  `deposit.depositId as "depositId"`,
  `deposit.originChainId as "originChainId"`,
  `deposit.destinationChainId as "destinationChainId"`,
  `deposit.depositor as "depositor"`,
  `deposit.recipient as "recipient"`,
  `deposit.inputToken as "inputToken"`,
  `deposit.inputAmount as "inputAmount"`,
  `deposit.outputToken as "outputToken"`,
  `deposit.outputAmount as "outputAmount"`,
  `deposit.message as "message"`,
  `deposit.messageHash as "messageHash"`,
  `deposit.exclusiveRelayer as "exclusiveRelayer"`,
  `deposit.exclusivityDeadline as "exclusivityDeadline"`,
  `deposit.fillDeadline as "fillDeadline"`,
  `deposit.quoteTimestamp as "quoteTimestamp"`,
  `deposit.transactionHash as "depositTxHash"`, // Renamed field
  `deposit.blockNumber as "depositBlockNumber"`,
  `deposit.blockTimestamp as "depositBlockTimestamp"`,
];

const RelayHashInfoFields = [
  `rhi.status as "status"`,
  `rhi.depositRefundTxHash as "depositRefundTxHash"`,
  `rhi.swapTokenPriceUsd as "swapTokenPriceUsd"`,
  `rhi.swapFeeUsd as "swapFeeUsd"`,
  `rhi.bridgeFeeUsd as "bridgeFeeUsd"`,
  `rhi.inputPriceUsd as "inputPriceUsd"`,
  `rhi.outputPriceUsd as "outputPriceUsd"`,
  `rhi.fillGasFee as "fillGasFee"`,
  `rhi.fillGasFeeUsd as "fillGasFeeUsd"`,
  `rhi.fillGasTokenPriceUsd as "fillGasTokenPriceUsd"`,
];

const FilledRelayFields = [
  `fill.relayer as "relayer"`,
  `fill.blockTimestamp as "fillBlockTimestamp"`,
  `fill.transactionHash as "fillTx"`, // Renamed field
];

const SwapBeforeBridgeFields = [
  `swap.transactionHash as "swapTransactionHash"`,
  `swap.swapToken as "swapToken"`,
  `swap.swapTokenAmount as "swapTokenAmount"`,
];
export class DepositsService {
  constructor(
    private db: DataSource,
    private redis: Redis,
  ) {}

  public async getDeposits(
    params: DepositsParams,
  ): Promise<ParsedDepositReturnType[]> {
    const repo = this.db.getRepository(entities.V3FundsDeposited);
    const queryBuilder = repo
      .createQueryBuilder("deposit")
      .leftJoinAndSelect(
        entities.RelayHashInfo,
        "rhi",
        "rhi.depositEventId = deposit.id",
      )
      .leftJoinAndSelect(
        entities.SwapBeforeBridge,
        "swap",
        "swap.id = rhi.swapBeforeBridgeEventId",
      )
      .leftJoinAndSelect(
        entities.FilledV3Relay,
        "fill",
        "fill.id = rhi.fillEventId",
      )
      .orderBy("deposit.blockTimestamp", "DESC")
      .select([
        ...DepositFields,
        ...RelayHashInfoFields,
        ...SwapBeforeBridgeFields,
        ...FilledRelayFields,
      ]);

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
      queryBuilder.offset(params.skip);
    }

    if (params.limit) {
      queryBuilder.limit(params.limit);
    }

    const deposits: DepositReturnType[] = await queryBuilder.execute();

    // Fetch speedup events for each deposit
    const speedupRepo = this.db.getRepository(
      entities.RequestedSpeedUpV3Deposit,
    );
    return Promise.all(
      deposits.map(async (deposit) => {
        const speedups = await speedupRepo
          .createQueryBuilder("speedup")
          .where(
            "speedup.depositId = :depositId AND speedup.originChainId = :originChainId",
            {
              depositId: deposit.depositId,
              originChainId: deposit.originChainId,
            },
          )
          .select([
            "speedup.transactionHash as transactionHash",
            "speedup.updatedRecipient as updatedRecipient",
            "speedup.updatedMessage as updatedMessage",
            "speedup.blockNumber as blockNumber",
            "speedup.updatedOutputAmount as updatedOutputAmount",
          ])
          .getRawMany();

        return {
          ...deposit,
          originChainId: parseInt(deposit.originChainId),
          destinationChainId: parseInt(deposit.destinationChainId),
          speedups,
        };
      }),
    );
  }

  public async getDepositStatus(
    params: DepositParams,
  ): Promise<DepositStatusResponse> {
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
      originChainId: parseInt(relay.originChainId),
      depositId: relay.depositId,
      depositTxHash: relay.depositTxHash,
      fillTx: relay.fillTxHash,
      destinationChainId: parseInt(relay.destinationChainId),
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

  public async getDeposit(
    params: DepositParams,
  ): Promise<DepositStatusResponse> {
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

    queryBuilder.leftJoinAndSelect(
      "depositEvent",
      "deposit",
      "rhi.depositEventId = deposit.id",
    );

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
      originChainId: parseInt(relay.originChainId),
      depositId: relay.depositId,
      depositTxHash: relay.depositTxHash,
      fillTx: relay.fillTxHash,
      destinationChainId: parseInt(relay.destinationChainId),
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

  public async getUnfilledDeposits(
    params: FilterDepositsParams,
  ): Promise<ParsedDepositReturnType[]> {
    const {
      originChainId,
      destinationChainId,
      startTimestamp = Date.now() - 5 * 60 * 1000,
      endTimestamp = Date.now(),
      skip,
      limit,
    } = params;

    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    const repo = this.db.getRepository(entities.V3FundsDeposited);
    const queryBuilder = repo
      .createQueryBuilder("deposit")
      .leftJoinAndSelect(
        entities.RelayHashInfo,
        "rhi",
        "rhi.depositEventId = deposit.id",
      )
      .where("rhi.status IN (:...unfilledStatuses)", {
        unfilledStatuses: [
          entities.RelayStatus.Unfilled,
          entities.RelayStatus.SlowFillRequested,
        ],
      })
      .andWhere("deposit.blockTimestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .orderBy("deposit.blockTimestamp", "DESC")
      .select([...DepositFields, ...RelayHashInfoFields]);

    if (originChainId) {
      queryBuilder.andWhere("deposit.originChainId = :originChainId", {
        originChainId,
      });
    }

    if (destinationChainId) {
      queryBuilder.andWhere(
        "deposit.destinationChainId = :destinationChainId",
        {
          destinationChainId,
        },
      );
    }

    queryBuilder.offset(skip);
    queryBuilder.limit(limit);

    const deposits: DepositReturnType[] = await queryBuilder.execute();

    // Fetch speedup events for each deposit
    const speedupRepo = this.db.getRepository(
      entities.RequestedSpeedUpV3Deposit,
    );
    return Promise.all(
      deposits.map(async (deposit) => {
        const speedups = await speedupRepo
          .createQueryBuilder("speedup")
          .where(
            "speedup.depositId = :depositId AND speedup.originChainId = :originChainId",
            {
              depositId: deposit.depositId,
              originChainId: deposit.originChainId,
            },
          )
          .select([
            "speedup.transactionHash as transactionHash",
            "speedup.updatedRecipient as updatedRecipient",
            "speedup.updatedMessage as updatedMessage",
            "speedup.blockNumber as blockNumber",
            "speedup.updatedOutputAmount as updatedOutputAmount",
          ])
          .getRawMany();

        return {
          ...deposit,
          originChainId: parseInt(deposit.originChainId),
          destinationChainId: parseInt(deposit.destinationChainId),
          speedups,
        };
      }),
    );
  }

  public async getFilledDeposits(
    params: FilterDepositsParams,
  ): Promise<ParsedDepositReturnType[]> {
    const {
      originChainId,
      destinationChainId,
      startTimestamp = Date.now() - 5 * 60 * 1000,
      endTimestamp = Date.now(),
      skip,
      limit,
      minSecondsToFill,
    } = params;

    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    const repo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = repo
      .createQueryBuilder("rhi")
      .leftJoinAndSelect(
        entities.V3FundsDeposited,
        "deposit",
        "deposit.id = rhi.depositEventId",
      )
      .leftJoinAndSelect(
        entities.FilledV3Relay,
        "fill",
        "fill.id = rhi.fillEventId",
      )
      .where("rhi.status = :status", { status: entities.RelayStatus.Filled })
      .andWhere("deposit.blockTimestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .orderBy("deposit.blockTimestamp", "DESC")
      .select([...DepositFields, ...RelayHashInfoFields, ...FilledRelayFields]);

    if (originChainId) {
      queryBuilder.andWhere("deposit.originChainId = :originChainId", {
        originChainId,
      });
    }

    if (destinationChainId) {
      queryBuilder.andWhere(
        "deposit.destinationChainId = :destinationChainId",
        {
          destinationChainId,
        },
      );
    }

    if (minSecondsToFill !== undefined) {
      queryBuilder.andWhere(
        "EXTRACT(EPOCH FROM (fill.blockTimestamp - deposit.blockTimestamp)) >= :minSecondsToFill",
        { minSecondsToFill },
      );
    }

    queryBuilder.offset(skip);
    queryBuilder.limit(limit);

    const deposits: DepositReturnType[] = await queryBuilder.execute();

    // Fetch speedup events for each deposit
    const speedupRepo = this.db.getRepository(
      entities.RequestedSpeedUpV3Deposit,
    );

    return Promise.all(
      deposits.map(async (deposit) => {
        const speedups = await speedupRepo
          .createQueryBuilder("speedup")
          .where(
            "speedup.depositId = :depositId AND speedup.originChainId = :originChainId",
            {
              depositId: deposit.depositId,
              originChainId: deposit.originChainId,
            },
          )
          .select([
            "speedup.transactionHash as transactionHash",
            "speedup.updatedRecipient as updatedRecipient",
            "speedup.updatedMessage as updatedMessage",
            "speedup.blockNumber as blockNumber",
            "speedup.updatedOutputAmount as updatedOutputAmount",
          ])
          .getRawMany();

        return {
          ...deposit,
          originChainId: parseInt(deposit.originChainId),
          destinationChainId: parseInt(deposit.destinationChainId),
          speedups,
        };
      }),
    );
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
