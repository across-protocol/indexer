import { Redis } from "ioredis";
import { CHAIN_IDs, TOKEN_SYMBOLS_MAP } from "@across-protocol/constants";
import { DataSource, entities } from "@repo/indexer-database";
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
    const fundsDepositedRepo = this.db.getRepository(entities.V3FundsDeposited);
    const fundsDepositedQueryBuilder = fundsDepositedRepo
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

    // Build DepositForBurn query with joins to linked CCTP events
    const depositForBurnRepo = this.db.getRepository(entities.DepositForBurn);
    const depositForBurnQueryBuilder = depositForBurnRepo
      .createQueryBuilder("depositForBurn")
      .leftJoinAndSelect(
        entities.MessageSent,
        "messageSent",
        "messageSent.transactionHash = depositForBurn.transactionHash AND messageSent.chainId = depositForBurn.chainId",
      )
      .leftJoinAndSelect(
        entities.MessageReceived,
        "messageReceived",
        "messageReceived.nonce = messageSent.nonce AND messageReceived.sourceDomain = messageSent.sourceDomain",
      )
      .leftJoinAndSelect(
        entities.MintAndWithdraw,
        "mintAndWithdraw",
        "mintAndWithdraw.transactionHash = messageReceived.transactionHash AND mintAndWithdraw.chainId = messageReceived.chainId",
      )
      .select([
        ...DepositForBurnFields,
        ...DepositForBurnRelayHashInfoFields,
        ...DepositForBurnSwapBeforeBridgeFields,
        ...DepositForBurnFilledRelayFields,
      ]);

    const oftSentRepo = this.db.getRepository(entities.OFTSent);
    const oftSentQueryBuilder = oftSentRepo
      .createQueryBuilder("oftSent")
      .leftJoinAndSelect(
        entities.OFTReceived,
        "oftReceived",
        "oftReceived.guid = oftSent.guid",
      )
      .select([
        ...OftSentFields,
        ...OftSentRelayHashInfoFields,
        ...OftSentSwapBeforeBridgeFields,
        ...OftSentFilledRelayFields,
      ]);

    if (params.address) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.depositor = :address OR deposit.recipient = :address",
        {
          address: params.address,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "depositForBurn.depositor = :address OR depositForBurn.mintRecipient = :address",
        {
          address: params.address,
        },
      );
      oftSentQueryBuilder.andWhere(
        "oftSent.fromAddress = :address OR oftReceived.toAddress = :address",
        {
          address: params.address,
        },
      );
    } else {
      if (params.depositor) {
        fundsDepositedQueryBuilder.andWhere("deposit.depositor = :depositor", {
          depositor: params.depositor,
        });
        depositForBurnQueryBuilder.andWhere(
          "depositForBurn.depositor = :depositor",
          {
            depositor: params.depositor,
          },
        );
        oftSentQueryBuilder.andWhere("oftSent.fromAddress = :depositor", {
          depositor: params.depositor,
        });
      }

      if (params.recipient) {
        fundsDepositedQueryBuilder.andWhere("deposit.recipient = :recipient", {
          recipient: params.recipient,
        });
        depositForBurnQueryBuilder.andWhere(
          "depositForBurn.mintRecipient = :recipient",
          {
            recipient: params.recipient,
          },
        );
        oftSentQueryBuilder.andWhere("oftReceived.toAddress = :recipient", {
          recipient: params.recipient,
        });
      }
    }

    if (params.inputToken) {
      fundsDepositedQueryBuilder.andWhere("deposit.inputToken = :inputToken", {
        inputToken: params.inputToken,
      });
      depositForBurnQueryBuilder.andWhere(
        "depositForBurn.burnToken = :inputToken",
        {
          inputToken: params.inputToken,
        },
      );
      oftSentQueryBuilder.andWhere("oftSent.token = :inputToken", {
        inputToken: params.inputToken,
      });
    }

    if (params.outputToken) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.outputToken = :outputToken",
        {
          outputToken: params.outputToken,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "mintAndWithdraw.mintToken = :outputToken",
        {
          outputToken: params.outputToken,
        },
      );
      oftSentQueryBuilder.andWhere("oftReceived.token = :outputToken", {
        outputToken: params.outputToken,
      });
    }

    if (params.originChainId) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.originChainId = :originChainId",
        {
          originChainId: params.originChainId,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "depositForBurn.chainId = :originChainId",
        {
          originChainId: params.originChainId,
        },
      );
      oftSentQueryBuilder.andWhere("oftSent.chainId = :originChainId", {
        originChainId: params.originChainId.toString(),
      });
    }

    if (params.destinationChainId) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.destinationChainId = :destinationChainId",
        {
          destinationChainId: params.destinationChainId,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "mintAndWithdraw.chainId = :destinationChainId",
        {
          destinationChainId: params.destinationChainId.toString(),
        },
      );
      oftSentQueryBuilder.andWhere(
        "oftReceived.chainId = :destinationChainId",
        {
          destinationChainId: params.destinationChainId.toString(),
        },
      );
    }

    if (params.status) {
      fundsDepositedQueryBuilder.andWhere("rhi.status = :status", {
        status: params.status,
      });

      // Filter CCTP and OFT deposits based on status
      if (
        params.status === entities.RelayStatus.Refunded ||
        params.status === entities.RelayStatus.SlowFillRequested ||
        params.status === entities.RelayStatus.SlowFilled ||
        params.status === entities.RelayStatus.Expired
      ) {
        // Exclude statuses that are not supported for CCTP and OFT deposits
        depositForBurnQueryBuilder.andWhere("1 = 0");
        oftSentQueryBuilder.andWhere("1 = 0");
      } else if (params.status === entities.RelayStatus.Filled) {
        depositForBurnQueryBuilder.andWhere("mintAndWithdraw.id IS NOT NULL");
        oftSentQueryBuilder.andWhere("oftReceived.id IS NOT NULL");
      } else if (params.status === entities.RelayStatus.Unfilled) {
        depositForBurnQueryBuilder.andWhere("mintAndWithdraw.id IS NULL");
        oftSentQueryBuilder.andWhere("oftReceived.id IS NULL");
      }
    }

    if (params.integratorId) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.integratorId = :integratorId",
        {
          integratorId: params.integratorId,
        },
      );

      // CCTP and OFT tables don't have integratorId, so exclude them
      // TODO: remove this once we add integratorId to CCTP and OFT tables
      depositForBurnQueryBuilder.andWhere("1 = 0");
      oftSentQueryBuilder.andWhere("1 = 0");
    }

    // Calculate upper bound for fetching records from each query
    // We fetch more than needed to ensure we have enough after sorting
    const skip = params.skip || 0;
    const limit = params.limit || 50;
    const upperBound = Math.min(
      skip + limit,
      DepositsService.MAX_RECORDS_PER_QUERY_TYPE,
    );

    const depositForBurnOrderBys =
      depositForBurnQueryBuilder.expressionMap.orderBys;
    if (Object.keys(depositForBurnOrderBys).length === 0) {
      depositForBurnQueryBuilder.orderBy(
        "depositForBurn.blockTimestamp",
        "DESC",
      );
    }
    const oftSentOrderBys = oftSentQueryBuilder.expressionMap.orderBys;
    if (Object.keys(oftSentOrderBys).length === 0) {
      oftSentQueryBuilder.orderBy("oftSent.blockTimestamp", "DESC");
    }

    fundsDepositedQueryBuilder.limit(upperBound);
    depositForBurnQueryBuilder.limit(upperBound);
    oftSentQueryBuilder.limit(upperBound);

    // Execute queries in parallel based on depositType filter
    const queryPromises: Promise<DepositReturnType[]>[] = [];

    if (!params.depositType || params.depositType === "across") {
      queryPromises.push(fundsDepositedQueryBuilder.getRawMany());
    }
    if (!params.depositType || params.depositType === "cctp") {
      queryPromises.push(depositForBurnQueryBuilder.getRawMany());
    }
    if (!params.depositType || params.depositType === "oft") {
      queryPromises.push(oftSentQueryBuilder.getRawMany());
    }

    // Execute all queries in parallel
    const queryResults = await Promise.all(queryPromises);

    let allDeposits: DepositReturnType[] = queryResults.flat();

    // Sort in memory by depositBlockTimestamp DESC
    allDeposits.sort((a, b) => {
      const timestampA = a.depositBlockTimestamp
        ? new Date(a.depositBlockTimestamp).getTime()
        : -Infinity; // Put null timestamps at the end
      const timestampB = b.depositBlockTimestamp
        ? new Date(b.depositBlockTimestamp).getTime()
        : -Infinity; // Put null timestamps at the end
      return timestampB - timestampA; // DESC order
    });

    // Apply skip and limit in memory
    allDeposits = allDeposits.slice(skip, skip + limit);

    type RawDepositResult = DepositReturnType & {
      destinationDomain?: number;
      destinationEndpointId?: number;
      outputToken?: string;
      outputAmount?: string;
    };
    const deposits: RawDepositResult[] = allDeposits;

    // Fetch speedup events for each deposit (only for V3FundsDeposited)
    const speedupRepo = this.db.getRepository(
      entities.RequestedSpeedUpV3Deposit,
    );
    return Promise.all(
      deposits.map(async (deposit) => {
        // Only fetch speedups if depositId exists (V3FundsDeposited deposits)
        const speedups =
          deposit.depositId && deposit.originChainId
            ? await speedupRepo
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
                .getRawMany()
            : [];

        // Derive CCTP fields if missing (for CCTP deposits where mint hasn't completed)
        let destinationChainId = deposit.destinationChainId
          ? parseInt(deposit.destinationChainId)
          : null;
        let outputToken = deposit.outputToken;
        let outputAmount = deposit.outputAmount;
        let bridgeFeeUsd = deposit.bridgeFeeUsd;

        const destinationDomain = deposit.destinationDomain;
        if (destinationDomain !== undefined && !destinationChainId) {
          try {
            const derivedChainId = getCctpDestinationChainFromDomain(
              destinationDomain,
              true, // productionNetworks = true
            );
            destinationChainId = derivedChainId;
          } catch (error) {
            destinationChainId = null;
          }

          // For CCTP, outputToken is USDC on the destination chain
          if (!outputToken && destinationChainId) {
            const usdcToken = TOKEN_SYMBOLS_MAP.USDC;
            const usdcAddress = usdcToken?.addresses[destinationChainId];
            if (usdcAddress) {
              outputToken = usdcAddress;
            }
          }

          // For CCTP, outputAmount is inputAmount if mint hasn't completed
          if (!outputAmount) {
            outputAmount = deposit.inputAmount;
          }
        }

        if (destinationDomain !== undefined && deposit.destinationChainId) {
          const bridgeFeeWei = across.utils.BigNumber.from(
            deposit.inputAmount,
          ).sub(outputAmount);
          // Get CCTP fee for fast transfers. For this computation we assume 1 USDC = 1 USD.
          bridgeFeeUsd = across.utils.formatUnits(bridgeFeeWei, 6);
        }

        // Derive OFT fields if missing (for OFT deposits where receive hasn't completed)
        const destinationEndpointId = deposit.destinationEndpointId;
        if (destinationEndpointId && !destinationChainId) {
          try {
            const derivedChainId = getChainIdForEndpointId(
              destinationEndpointId,
            );
            destinationChainId = derivedChainId;
          } catch (error) {
            destinationChainId = null;
          }

          // For OFT, outputToken is the corresponding token on the destination chain
          if (
            !outputToken &&
            destinationChainId &&
            deposit.inputToken &&
            deposit.originChainId
          ) {
            try {
              const originChainId = parseInt(deposit.originChainId);
              const correspondingToken = getCorrespondingTokenAddress(
                originChainId,
                deposit.inputToken,
                destinationChainId,
              );
              outputToken = correspondingToken;
            } catch (error) {
              // If we can't find the corresponding token, leave outputToken as is
            }
          }

          // For OFT, outputAmount is inputAmount if receive hasn't completed
          if (!outputAmount) {
            outputAmount = deposit.inputAmount;
          }
        }

        let status = deposit.status;
        if (!status && deposit.fillTx) {
          status = entities.RelayStatus.Filled;
        } else if (!status) {
          status = entities.RelayStatus.Unfilled;
        }

        // Destructure to exclude destinationDomain and destinationEndpointId from the response
        const {
          destinationDomain: _,
          destinationEndpointId: __,
          ...depositWithoutDomain
        } = deposit;
        return {
          ...depositWithoutDomain,
          status: status,
          depositTxnRef: deposit.depositTxHash,
          depositRefundTxnRef: deposit.depositRefundTxHash,
          fillTxnRef: deposit.fillTx,
          originChainId: parseInt(deposit.originChainId),
          destinationChainId: destinationChainId,
          outputToken: outputToken,
          outputAmount: outputAmount,
          speedups,
          bridgeFeeUsd,
        };
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
