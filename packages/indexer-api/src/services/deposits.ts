import { Redis } from "ioredis";
import { CHAIN_IDs, TOKEN_SYMBOLS_MAP } from "@across-protocol/constants";
import { DataSource, entities } from "@repo/indexer-database";
import { SelectQueryBuilder, Brackets, Repository } from "typeorm";
import * as across from "@across-protocol/sdk";
import type {
  DepositParams,
  DepositsParams,
  FilterDepositsParams,
  DepositReturnType,
  ParsedDepositReturnType,
  DepositStatusResponse,
  DepositStatusParams,
} from "../dtos/deposits.dto";
import {
  DepositNotFoundException,
  HyperliquidWithdrawalNotFoundException,
  IncorrectQueryParamsException,
  IndexParamOutOfRangeException,
} from "./exceptions";
import {
  DepositFields,
  RelayHashInfoFields,
  FilledRelayFields,
  SwapBeforeBridgeFields,
  DepositForBurnFields,
  DepositForBurnRelayHashInfoFields,
  DepositForBurnFilledRelayFields,
  DepositForBurnSwapBeforeBridgeFields,
  OftSentFields,
  OftSentRelayHashInfoFields,
  OftSentFilledRelayFields,
  OftSentSwapBeforeBridgeFields,
} from "../utils/fields";
import { getCctpDestinationChainFromDomain } from "@across-protocol/sdk/dist/cjs/utils/CCTPUtils";
import {
  getChainIdForEndpointId,
  getCorrespondingTokenAddress,
} from "@repo/indexer";

export class DepositsService {
  private static readonly MAX_RECORDS_PER_QUERY_TYPE = 1000;

  constructor(
    private db: DataSource,
    private redis: Redis,
  ) {}

  public async getDeposits(
    params: DepositsParams,
  ): Promise<ParsedDepositReturnType[]> {
    const skip = params.skip || 0;
    const limit = params.limit || 10;

    const queryBuilder = this.db
      .getRepository(entities.Deposit)
      .createQueryBuilder("deposits")
      .select([
        "deposits.id",
        "deposits.uniqueId",
        "deposits.type",
        "deposits.status",
        "deposits.blockTimestamp",
        "deposits.originChainId",
        "deposits.destinationChainId",
        "deposits.depositor",
        "deposits.recipient",
      ]);

    // Join Related Event Tables
    // We fetch details for all types because a row could be any of them.

    // --- Across V3 Joins ---
    // Link: Deposit -> V3FundsDeposited
    queryBuilder.leftJoinAndSelect("deposits.v3FundsDeposited", "deposit");

    // Link: Deposit -> FilledV3Relay
    queryBuilder.leftJoinAndSelect("deposits.filledV3Relay", "fill");

    // Link: V3FundsDeposited -> RelayHashInfo (RHI)
    queryBuilder.leftJoinAndSelect(
      entities.RelayHashInfo,
      "rhi",
      "rhi.depositEventId = deposit.id",
    );

    // Link: RHI -> SwapBeforeBridge
    queryBuilder.leftJoinAndSelect(
      entities.SwapBeforeBridge,
      "swap",
      "swap.id = rhi.swapBeforeBridgeEventId",
    );

    // --- CCTP Joins ---
    queryBuilder.leftJoinAndSelect("deposits.depositForBurn", "depositForBurn");
    queryBuilder.leftJoinAndSelect(
      "deposits.mintAndWithdraw",
      "mintAndWithdraw",
    );

    // Join MessageSent/Received
    queryBuilder.leftJoinAndSelect(
      entities.MessageSent,
      "messageSent",
      "messageSent.transactionHash = depositForBurn.transactionHash AND messageSent.chainId = depositForBurn.chainId",
    );
    queryBuilder.leftJoinAndSelect(
      entities.MessageReceived,
      "messageReceived",
      "messageReceived.nonce = messageSent.nonce AND messageReceived.sourceDomain = messageSent.sourceDomain",
    );

    // --- OFT Joins ---
    queryBuilder.leftJoinAndSelect("deposits.oftSent", "oftSent");
    queryBuilder.leftJoinAndSelect("deposits.oftReceived", "oftReceived");

    // Apply Filters (Preserving Original Logic)
    // Filter: Deposit Type
    if (params.depositType) {
      queryBuilder.andWhere("deposits.type = :type", {
        type: params.depositType,
      });
    }

    // Filter: Address (Depositor OR Recipient)
    if (params.address) {
      queryBuilder.andWhere(
        "(deposits.depositor = :address OR deposits.recipient = :address)",
        { address: params.address },
      );
    } else {
      // Specific Filters
      if (params.depositor) {
        queryBuilder.andWhere("deposits.depositor = :depositor", {
          depositor: params.depositor,
        });
      }
      if (params.recipient) {
        queryBuilder.andWhere("deposits.recipient = :recipient", {
          recipient: params.recipient,
        });
      }
    }

    // Filter: Chains
    if (params.originChainId) {
      queryBuilder.andWhere("deposits.originChainId = :originChainId", {
        originChainId: params.originChainId,
      });
    }
    if (params.destinationChainId) {
      queryBuilder.andWhere("deposits.destinationChainId = :destChainId", {
        destChainId: params.destinationChainId,
      });
    }

    // Filter: Tokens (Input)
    // Checks all 3 protocol tables
    if (params.inputToken) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where("deposit.inputToken = :inputToken")
            .orWhere("depositForBurn.burnToken = :inputToken")
            .orWhere("oftSent.token = :inputToken");
        }),
        { inputToken: params.inputToken },
      );
    }

    // Filter: Tokens (Output)
    // Checks all 3 protocol tables
    if (params.outputToken) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where("deposit.outputToken = :outputToken")
            .orWhere("mintAndWithdraw.mintToken = :outputToken")
            .orWhere("oftReceived.token = :outputToken");
        }),
        { outputToken: params.outputToken },
      );
    }

    // Filter: Status
    if (params.status) {
      // Map generic status to table logic
      if (params.status === entities.RelayStatus.Filled) {
        queryBuilder.andWhere("deposits.status = :status", {
          status: entities.DepositStatus.FILLED,
        });
      } else if (params.status === entities.RelayStatus.Unfilled) {
        queryBuilder.andWhere("deposits.status = :status", {
          status: entities.DepositStatus.PENDING,
        });
      } else {
        // Fallback for statuses like 'refunded', 'slowFilled' which might check specific RHI columns
        // For now, filtering against the RHI joined table for Across specifics:
        queryBuilder.andWhere("rhi.status = :status", {
          status: params.status,
        });

        // If searching for refund/expired, exclude CCTP/OFT
        if (
          [
            entities.RelayStatus.Refunded,
            entities.RelayStatus.SlowFillRequested,
            entities.RelayStatus.SlowFilled,
            entities.RelayStatus.Expired,
          ].includes(params.status)
        ) {
          queryBuilder.andWhere("deposits.type = :acrossType", {
            acrossType: entities.DepositType.ACROSS,
          });
        }
      }
    }

    // Filter: Integrator ID (Across only)
    if (params.integratorId) {
      queryBuilder.andWhere("deposit.integratorId = :integratorId", {
        integratorId: params.integratorId,
      });
      // Original logic: Exclude CCTP/OFT if integratorId is present
      queryBuilder.andWhere("deposits.type = :acrossType", {
        acrossType: entities.DepositType.ACROSS,
      });
    }

    // Sorting & Pagination
    queryBuilder
      .orderBy("deposits.blockTimestamp", "DESC")
      .skip(skip)
      .take(limit);

    // Execute Query
    const results = await queryBuilder.getMany();

    // Map & Format Results
    return Promise.all(
      results.map(async (row) => {
        if (row.type === entities.DepositType.ACROSS) {
          return mapAcrossDeposit(
            row,
            this.db.getRepository(entities.RequestedSpeedUpV3Deposit),
          );
        } else if (row.type === entities.DepositType.CCTP) {
          return mapCctpDeposit(row);
        } else if (row.type === entities.DepositType.OFT) {
          return mapOftDeposit(row);
        }

        // Fallback for unknown types (should not happen with correct enum usage)
        return {
          uniqueId: row.uniqueId,
          originChainId: parseInt(row.originChainId),
          destinationChainId: parseInt(row.destinationChainId),
          blockTimestamp: row.blockTimestamp,
        } as unknown as ParsedDepositReturnType;
      }),
    );
  }

  public async getDepositStatus(
    params: DepositStatusParams,
  ): Promise<DepositStatusResponse> {
    // in the validation rules each of these params are marked as optional
    // but we need to check that at least one of them is present
    if (
      !(
        (params.depositId && params.originChainId) ||
        params.depositTxHash ||
        params.depositTxnRef ||
        params.relayDataHash ||
        (params.from && params.hypercoreWithdrawalNonce)
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

    if (params.from && params.hypercoreWithdrawalNonce) {
      // Hyperliquid Withdrawal status check
      return this.getHyperliquidWithdrawalStatus(params);
    }

    // no cached data, so we need to query the database
    const repo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = repo.createQueryBuilder("rhi");

    if (params.depositTxHash || params.depositTxnRef) {
      return this.getDepositStatusByTxnRef(
        (params.depositTxHash || params.depositTxnRef) as string,
        params.index,
      );
    }

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
    } else if (params.depositTxnRef) {
      queryBuilder.andWhere("rhi.depositTxHash = :depositTxnRef", {
        depositTxnRef: params.depositTxnRef,
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
      depositTxnRef: relay.depositTxHash,
      fillTx: relay.fillTxHash,
      fillTxnRef: relay.fillTxHash,
      destinationChainId: parseInt(relay.destinationChainId),
      depositRefundTxHash: relay.depositRefundTxHash,
      depositRefundTxnRef: relay.depositRefundTxHash,
      actionsSucceeded:
        relay.includedActions === true &&
        relay.status === entities.RelayStatus.Filled
          ? relay.callsFailedEventId === null
          : null,
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

  /**
   * Get deposit status by transaction reference. The transaction can have multiple types of deposits,
   * so we need to check all of them: across intents, mint burn and others in the future.
   * @param txnRef transaction reference
   * @param index index of the deposit in case of multiple matching deposits
   */
  private async getDepositStatusByTxnRef(txnRef: string, index: number) {
    const intentsQueryBuilder = this.db
      .getRepository(entities.RelayHashInfo)
      .createQueryBuilder("rhi")
      .andWhere("rhi.depositTxHash = :depositTxHash", {
        depositTxHash: txnRef,
      })
      .orderBy("rhi.depositEventId", "ASC");

    const cctpQueryBuilder = this.db
      .getRepository<
        entities.MessageSent & { receivedEvent: entities.MessageReceived }
      >(entities.MessageSent)
      .createQueryBuilder("ms")
      .leftJoinAndMapOne(
        "ms.receivedEvent",
        entities.MessageReceived,
        "mr",
        "mr.nonce = ms.nonce and mr.sourceDomain = ms.sourceDomain",
      )
      .where("ms.transactionHash = :transactionHash", {
        transactionHash: txnRef,
      })
      .orderBy("ms.id", "ASC");

    const oftQueryBuilder = this.db
      .getRepository<
        entities.OFTSent & { receivedEvent: entities.OFTReceived }
      >(entities.OFTSent)
      .createQueryBuilder("s")
      .leftJoinAndMapOne(
        "s.receivedEvent",
        entities.OFTReceived,
        "r",
        "r.guid = s.guid",
      )
      .where("s.transactionHash = :transactionHash", {
        transactionHash: txnRef,
      })
      .orderBy("s.id", "ASC");

    const [intentDeposits, cctpDeposits, oftDeposits] = await Promise.all([
      intentsQueryBuilder.getMany(),
      cctpQueryBuilder.getMany(),
      oftQueryBuilder.getMany(),
    ]);
    const taggedIntentDeposits = intentDeposits.map((deposit) => ({
      type: "across-intents",
      deposit,
    }));
    const taggedCctpDeposits = cctpDeposits.map((deposit) => ({
      type: "cctp",
      deposit,
    }));
    const taggedOftDeposits = oftDeposits.map((deposit) => ({
      type: "oft",
      deposit,
    }));
    const taggedDeposits: {
      type: string;
      deposit: entities.RelayHashInfo | entities.MessageSent | entities.OFTSent;
    }[] = [
      ...taggedIntentDeposits,
      ...taggedCctpDeposits,
      ...taggedOftDeposits,
    ];

    if (taggedDeposits.length === 0) throw new DepositNotFoundException();

    const matchingDeposit = taggedDeposits[index];
    if (!matchingDeposit) {
      throw new IndexParamOutOfRangeException(
        `Index ${index} out of range. Index must be between 0 and ${taggedDeposits.length - 1}`,
      );
    }

    if (matchingDeposit.type === "across-intents") {
      return this.getDepositStatusForAcrossIntentsDeposit(
        matchingDeposit.deposit as entities.RelayHashInfo,
        index,
        taggedDeposits.length - 1,
      );
    }

    if (matchingDeposit.type === "cctp") {
      return this.getDepositStatusForCctpDeposit(
        matchingDeposit.deposit as entities.MessageSent & {
          receivedEvent: entities.MessageReceived;
        },
        index,
        taggedDeposits.length - 1,
      );
    }

    if (matchingDeposit.type === "oft") {
      return this.getDepositStatusForOftDeposit(
        matchingDeposit.deposit as entities.OFTSent & {
          receivedEvent: entities.OFTReceived;
        },
        index,
        taggedDeposits.length - 1,
      );
    }

    throw new Error(`Unknown deposit type: ${matchingDeposit.type}`);
  }

  private getDepositStatusForAcrossIntentsDeposit(
    deposit: entities.RelayHashInfo,
    currentIndex: number,
    maxIndex: number,
  ) {
    const result = {
      status:
        deposit.status === entities.RelayStatus.Unfilled
          ? "pending"
          : deposit.status,
      originChainId: parseInt(deposit.originChainId),
      depositId: deposit.depositId,
      depositTxHash: deposit.depositTxHash,
      depositTxnRef: deposit.depositTxHash,
      fillTx: deposit.fillTxHash,
      fillTxnRef: deposit.fillTxHash,
      destinationChainId: parseInt(deposit.destinationChainId),
      depositRefundTxHash: deposit.depositRefundTxHash,
      depositRefundTxnRef: deposit.depositRefundTxHash,
      actionsSucceeded:
        deposit.includedActions === true &&
        deposit.status === entities.RelayStatus.Filled
          ? deposit.callsFailedEventId === null
          : null,
      pagination: {
        currentIndex,
        maxIndex,
      },
    };

    return result;
  }

  private getDepositStatusForCctpDeposit(
    deposit: entities.MessageSent & { receivedEvent: entities.MessageReceived },
    currentIndex: number,
    maxIndex: number,
  ) {
    const result = {
      status: !deposit.receivedEvent ? "pending" : "filled",
      originChainId: parseInt(deposit.chainId),
      depositId: deposit.nonce,
      depositTxHash: deposit.transactionHash,
      depositTxnRef: deposit.transactionHash,
      fillTx: deposit.receivedEvent?.transactionHash,
      fillTxnRef: deposit.receivedEvent?.transactionHash,
      destinationChainId: parseInt(deposit.receivedEvent?.chainId),
      depositRefundTxHash: undefined,
      depositRefundTxnRef: undefined,
      actionsSucceeded: null,
      pagination: {
        currentIndex,
        maxIndex,
      },
    };

    return result;
  }

  private getDepositStatusForOftDeposit(
    deposit: entities.OFTSent & { receivedEvent: entities.OFTReceived },
    currentIndex: number,
    maxIndex: number,
  ) {
    const result = {
      status: !deposit.receivedEvent ? "pending" : "filled",
      originChainId: parseInt(deposit.chainId),
      depositId: deposit.guid,
      depositTxHash: deposit.transactionHash,
      depositTxnRef: deposit.transactionHash,
      fillTx: deposit.receivedEvent?.transactionHash,
      fillTxnRef: deposit.receivedEvent?.transactionHash,
      destinationChainId: parseInt(deposit.receivedEvent?.chainId),
      depositRefundTxHash: undefined,
      depositRefundTxnRef: undefined,
      actionsSucceeded: null,
      pagination: {
        currentIndex,
        maxIndex,
      },
    };

    return result;
  }

  private async getHyperliquidWithdrawalStatus(params: DepositStatusParams) {
    const cacheKey = this.getDepositStatusCacheKey(params);
    const repo = this.db.getRepository(entities.HypercoreCctpWithdraw);
    const withdrawal = await repo.findOne({
      where: {
        fromAddress: params.from,
        hypercoreNonce: params.hypercoreWithdrawalNonce,
      },
    });

    if (!withdrawal) {
      throw new HyperliquidWithdrawalNotFoundException();
    }

    const result = {
      status: "filled",
      originChainId: CHAIN_IDs.HYPERCORE,
      depositId: params.hypercoreWithdrawalNonce as string, // it cannot be undefined because of the query validation rules
      depositTxnRef: null,
      fillTxnRef: withdrawal.mintTxnHash,
      destinationChainId: parseInt(withdrawal.destinationChainId),
      depositRefundTxnRef: null,
      actionsSucceeded: null,
      pagination: {
        currentIndex: 0,
        maxIndex: 0,
      },
    };

    const cacheTtlSeconds = 60 * 5; // 5 minutes
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      cacheTtlSeconds,
    );

    return result;
  }

  public async getDeposit(params: DepositParams) {
    // in the validation rules each of these params are marked as optional
    // but we need to check that at least one of them is present
    if (
      !(
        (params.depositId && params.originChainId) ||
        params.depositTxHash ||
        params.depositTxnRef ||
        params.relayDataHash
      )
    ) {
      throw new IncorrectQueryParamsException();
    }

    // construct cache key
    const cacheKey = this.getDepositCacheKey(params);
    const cachedData = await this.redis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // no cached data, so we need to query the database
    const repo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = repo.createQueryBuilder("rhi");

    queryBuilder.leftJoinAndSelect(
      entities.V3FundsDeposited,
      "deposit",
      "rhi.depositEventId = deposit.id",
    );
    queryBuilder.leftJoinAndSelect(
      entities.SwapBeforeBridge,
      "swap",
      "swap.id = rhi.swapBeforeBridgeEventId",
    );
    queryBuilder.leftJoinAndSelect(
      entities.FilledV3Relay,
      "fill",
      "fill.id = rhi.fillEventId",
    );
    queryBuilder.leftJoinAndSelect(
      entities.SwapMetadata,
      "swapMetadata",
      `swapMetadata.relayHashInfoId = rhi.id AND swapMetadata.side = '${entities.SwapSide.DESTINATION_SWAP}'::"evm"."swap_metadata_side_enum"`,
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
    } else if (params.depositTxnRef) {
      queryBuilder.andWhere("rhi.depositTxHash = :depositTxnRef", {
        depositTxnRef: params.depositTxnRef,
      });
    }

    if (params.relayDataHash) {
      queryBuilder.andWhere("rhi.relayHash = :relayDataHash", {
        relayDataHash: params.relayDataHash,
      });
    }

    const matchingRelays = await queryBuilder
      .orderBy("rhi.depositEventId", "ASC")
      .select([
        ...DepositFields,
        ...RelayHashInfoFields,
        ...SwapBeforeBridgeFields,
        ...FilledRelayFields,
      ])
      .execute();
    const numberMatchingRelays = matchingRelays.length;
    if (numberMatchingRelays === 0) throw new DepositNotFoundException();
    const relay = matchingRelays[params.index];
    if (!relay) {
      throw new IndexParamOutOfRangeException(
        `Index ${params.index} out of range. Index must be between 0 and ${numberMatchingRelays - 1}`,
      );
    }

    const result = {
      deposit: {
        ...relay,
        depositTxnRef: relay.depositTxHash,
        depositRefundTxnRef: relay.depositRefundTxHash,
        fillTxnRef: relay.fillTxHash,
      },
      pagination: {
        currentIndex: params.index,
        maxIndex: numberMatchingRelays - 1,
      },
    };

    if (this.shouldCacheDepositResponse(relay)) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        this.getDepositCacheTTLSeconds(relay),
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
      .leftJoinAndSelect(
        entities.SwapMetadata,
        "swapMetadata",
        `swapMetadata.relayHashInfoId = rhi.id AND swapMetadata.side = '${entities.SwapSide.DESTINATION_SWAP}'::"evm"."swap_metadata_side_enum"`,
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
      .leftJoinAndSelect(
        entities.SwapMetadata,
        "swapMetadata",
        `swapMetadata.relayHashInfoId = rhi.id AND swapMetadata.side = '${entities.SwapSide.DESTINATION_SWAP}'::"evm"."swap_metadata_side_enum"`,
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

  private getDepositCacheTTLSeconds(deposit: DepositReturnType) {
    const minute = 60;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (
      deposit.status === entities.RelayStatus.Filled &&
      deposit.depositBlockTimestamp &&
      deposit.fillBlockTimestamp &&
      deposit.bridgeFeeUsd
    ) {
      return hour;
    }

    if (deposit.status === entities.RelayStatus.Refunded) {
      return hour;
    }

    return 0;
  }

  private shouldCacheDepositStatusResponse(status: entities.RelayStatus) {
    return [
      entities.RelayStatus.Expired,
      entities.RelayStatus.Filled,
      entities.RelayStatus.Refunded,
      entities.RelayStatus.SlowFillRequested,
    ].includes(status);
  }

  private shouldCacheDepositResponse(deposit: DepositReturnType) {
    if (
      deposit.status === entities.RelayStatus.Filled &&
      deposit.depositBlockTimestamp &&
      deposit.fillBlockTimestamp &&
      deposit.bridgeFeeUsd
    ) {
      return true;
    }

    if (deposit.status === entities.RelayStatus.Refunded) {
      return true;
    }

    return false;
  }

  private getDepositStatusCacheKey(params: DepositStatusParams) {
    if (params.depositId && params.originChainId) {
      return `depositStatus-${params.depositId}-${params.originChainId}-${params.index}`;
    }
    if (params.depositTxHash) {
      return `depositStatus-${params.depositTxHash}-${params.index}`;
    } else if (params.depositTxnRef) {
      return `depositStatus-${params.depositTxnRef}-${params.index}`;
    }
    if (params.relayDataHash) {
      return `depositStatus-${params.relayDataHash}-${params.index}`;
    }

    if (params.from && params.hypercoreWithdrawalNonce) {
      return `depositStatus-${params.from}-${params.hypercoreWithdrawalNonce}`;
    }

    // in theory this should never happen because we have already checked
    // that at least one of the params is present
    throw new Error(
      "Could not get deposit status: could not locate cache data",
    );
  }

  private getDepositCacheKey(params: DepositParams) {
    if (params.depositId && params.originChainId) {
      return `deposit-${params.depositId}-${params.originChainId}-${params.index}`;
    }
    if (params.depositTxHash) {
      return `deposit-${params.depositTxHash}-${params.index}`;
    } else if (params.depositTxnRef) {
      return `deposit-${params.depositTxnRef}-${params.index}`;
    }
    if (params.relayDataHash) {
      return `deposit-${params.relayDataHash}-${params.index}`;
    }

    // in theory this should never happen because we have already checked
    // that at least one of the params is present
    throw new Error("Could not get deposit: could not locate cache data");
  }
}

/**
 * Maps an ACROSS type Deposit row to the response DTO.
 *
 * This function handles the flattening of the V3FundsDeposited, RelayHashInfo,
 * and FilledV3Relay entities. It also asynchronously fetches any associated
 * speedup events for the deposit.
 *
 * @param row - The raw Deposit entity joined with Across-specific relations.
 * @param speedupRepo - The repository used to fetch speedup events (RequestedSpeedUpV3Deposit).
 * @returns A promise resolving to the parsed deposit object compatible with the API response.
 */
export async function mapAcrossDeposit(
  row: entities.Deposit,
  speedupRepo: Repository<entities.RequestedSpeedUpV3Deposit>,
): Promise<ParsedDepositReturnType> {
  const v3Event = row.v3FundsDeposited;
  const rhi = (row as any).rhi || {};
  const swap = (row as any).swap || {};
  const fill = row.filledV3Relay;

  // Fetch Speedups
  let speedups: any[] = [];
  if (v3Event?.depositId && v3Event?.originChainId) {
    speedups = await speedupRepo
      .createQueryBuilder("speedup")
      .where(
        "speedup.depositId = :depositId AND speedup.originChainId = :originChainId",
        {
          depositId: v3Event.depositId,
          originChainId: v3Event.originChainId,
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
  }

  // Determine Status
  let status = rhi.status;
  if (!status && fill) status = entities.RelayStatus.Filled;
  else if (!status) status = entities.RelayStatus.Unfilled;

  const mapped = {
    ...v3Event,
    ...rhi,
    ...swap,
    ...fill,

    originChainId: parseInt(row.originChainId),
    destinationChainId: parseInt(row.destinationChainId),
    depositor: row.depositor,
    recipient: row.recipient,
    status: status,

    depositTxnRef: v3Event?.transactionHash,
    depositRefundTxnRef: rhi?.depositRefundTxHash,
    fillTxnRef: fill?.transactionHash,

    speedups,
  };

  const finalOutputToken = v3Event?.outputToken;
  const finalOutputAmount = v3Event?.outputAmount;
  const finalBridgeFeeUsd = rhi?.bridgeFeeUsd;

  // Cleanup internal fields
  const { destinationDomain, destinationEndpointId, uniqueId, ...rest } =
    mapped as any;

  return {
    ...rest,
    outputToken: finalOutputToken,
    outputAmount: finalOutputAmount,
    bridgeFeeUsd: finalBridgeFeeUsd,
    uniqueId: row.uniqueId,
  } as ParsedDepositReturnType;
}

/**
 * Maps a CCTP type Deposit row to the response DTO.
 *
 * This function consolidates the DepositForBurn (source) and MintAndWithdraw (fill) events.
 * It also contains logic to derive the destination chain ID from the CCTP domain
 * and calculate the bridge fee based on input vs output amounts.
 *
 * @param row - The raw Deposit entity joined with CCTP-specific relations.
 * @returns The parsed deposit object compatible with the API response.
 */
export function mapCctpDeposit(row: entities.Deposit): ParsedDepositReturnType {
  const source = row.depositForBurn;
  const fill = row.mintAndWithdraw;
  const msgSent = (row as any).messageSent;

  const status = fill ? "filled" : "pending";

  const mapped = {
    ...source,
    ...fill,

    originChainId: parseInt(row.originChainId),
    destinationChainId: parseInt(row.destinationChainId),
    depositor: row.depositor,
    recipient: row.recipient,
    status: status,

    depositTxnRef: source?.transactionHash,
    depositRefundTxnRef: undefined,
    fillTxnRef: fill?.transactionHash,

    depositId: msgSent?.nonce,
    speedups: [],
  };

  // Logic: Derive Output Token/Amount
  let destinationChainId = parseInt(row.destinationChainId);
  let outputToken = fill?.mintToken;
  let outputAmount = fill?.amount;
  let finalBridgeFeeUsd: string | undefined;

  if (!destinationChainId && source?.destinationDomain !== undefined) {
    try {
      destinationChainId = getCctpDestinationChainFromDomain(
        source.destinationDomain,
        true,
      );
    } catch (e) {
      /* ignore */
    }
  }

  if (!outputToken && destinationChainId) {
    const usdcToken = TOKEN_SYMBOLS_MAP.USDC;
    const usdcAddress = usdcToken?.addresses[destinationChainId];
    if (usdcAddress) outputToken = usdcAddress;
  }

  if (!outputAmount && source?.amount) {
    outputAmount = source.amount;
  }

  if (source?.destinationDomain !== undefined && destinationChainId) {
    const inputBn = across.utils.BigNumber.from(source.amount || "0");
    const outputBn = across.utils.BigNumber.from(outputAmount || "0");
    const bridgeFeeWei = inputBn.sub(outputBn);
    finalBridgeFeeUsd = across.utils.formatUnits(bridgeFeeWei, 6);
  }

  const { destinationDomain, destinationEndpointId, uniqueId, ...rest } =
    mapped as any;

  return {
    ...rest,
    outputToken: outputToken,
    outputAmount: outputAmount,
    bridgeFeeUsd: finalBridgeFeeUsd,
    uniqueId: row.uniqueId,
  } as ParsedDepositReturnType;
}

/**
 * Maps an OFT type Deposit row to the response DTO.
 *
 * This function consolidates OFTSent (source) and OFTReceived (fill) events.
 * It includes logic to derive the destination chain ID from the LayerZero endpoint ID
 * and find the corresponding token address on the destination chain.
 *
 * @param row - The raw Deposit entity joined with OFT-specific relations.
 * @returns The parsed deposit object compatible with the API response.
 */
export function mapOftDeposit(row: entities.Deposit): ParsedDepositReturnType {
  const source = row.oftSent;
  const fill = row.oftReceived;

  const status = fill ? "filled" : "pending";

  const mapped = {
    ...source,
    ...fill,

    originChainId: parseInt(row.originChainId),
    destinationChainId: parseInt(row.destinationChainId),
    depositor: row.depositor,
    recipient: row.recipient,
    status: status,

    depositTxnRef: source?.transactionHash,
    depositRefundTxnRef: undefined,
    fillTxnRef: fill?.transactionHash,
    depositId: source?.guid || fill?.guid,
    speedups: [],
  };

  // Logic: Derive Output Token/Amount
  let destinationChainId = parseInt(row.destinationChainId);
  let outputToken = fill?.token;
  let outputAmount = fill?.amountReceivedLD;

  if (!destinationChainId && source?.dstEid) {
    try {
      destinationChainId = getChainIdForEndpointId(source.dstEid);
    } catch (e) {
      /* ignore */
    }
  }

  if (
    !outputToken &&
    destinationChainId &&
    source?.token &&
    row.originChainId
  ) {
    try {
      const originChainId = parseInt(row.originChainId);
      const correspondingToken = getCorrespondingTokenAddress(
        originChainId,
        source.token,
        destinationChainId,
      );
      outputToken = correspondingToken;
    } catch (e) {
      /* ignore */
    }
  }

  if (!outputAmount && source?.amountSentLD) {
    outputAmount = source.amountSentLD;
  }

  const { destinationDomain, destinationEndpointId, uniqueId, ...rest } =
    mapped as any;

  return {
    ...rest,
    outputToken: outputToken,
    outputAmount: outputAmount,
    uniqueId: row.uniqueId,
  } as ParsedDepositReturnType;
}
