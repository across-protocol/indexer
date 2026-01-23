import { Redis } from "ioredis";
import { CHAIN_IDs, TOKEN_SYMBOLS_MAP } from "@across-protocol/constants";
import { DataSource, entities } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { utils } from "@across-protocol/sdk";
import { findCctpBurnEventForHyperliquidDeposit } from "@repo/indexer";
import type {
  DepositParams,
  DepositsParams,
  FilterDepositsParams,
  DepositReturnType,
  ParsedDepositReturnType,
  DepositStatusResponse,
  DepositStatusParams,
  HyperliquidTransfersParams,
  HyperliquidTransferResponse,
} from "../dtos/deposits.dto";
import {
  DepositNotFoundException,
  HyperliquidWithdrawalNotFoundException,
  HyperliquidDepositNotFoundException,
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
        entities.SponsoredDepositForBurn,
        "sponsoredDepositForBurn",
        "sponsoredDepositForBurn.transactionHash = depositForBurn.transactionHash AND sponsoredDepositForBurn.chainId = depositForBurn.chainId",
      )
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
      .leftJoinAndSelect(
        entities.SwapFlowInitialized,
        "swapFlowInitialized",
        "swapFlowInitialized.quoteNonce = sponsoredDepositForBurn.quoteNonce",
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
        entities.SponsoredOFTSend,
        "sponsoredOFTSend",
        "sponsoredOFTSend.transactionHash = oftSent.transactionHash AND sponsoredOFTSend.chainId = oftSent.chainId",
      )
      .leftJoinAndSelect(
        entities.OFTReceived,
        "oftReceived",
        "oftReceived.guid = oftSent.guid",
      )
      .leftJoinAndSelect(
        entities.SwapFlowInitialized,
        "swapFlowInitialized",
        "swapFlowInitialized.quoteNonce = sponsoredOFTSend.quoteNonce",
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
        "COALESCE(sponsoredDepositForBurn.originSender, depositForBurn.depositor) = :address OR COALESCE(sponsoredDepositForBurn.finalRecipient, depositForBurn.mintRecipient) = :address",
        {
          address: params.address,
        },
      );
      oftSentQueryBuilder.andWhere(
        "COALESCE(sponsoredOFTSend.originSender, oftSent.fromAddress) = :address OR COALESCE(sponsoredOFTSend.finalRecipient, oftReceived.toAddress) = :address",
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
          "COALESCE(sponsoredDepositForBurn.originSender, depositForBurn.depositor) = :depositor",
          {
            depositor: params.depositor,
          },
        );
        oftSentQueryBuilder.andWhere(
          "COALESCE(sponsoredOFTSend.originSender, oftSent.fromAddress) = :depositor",
          {
            depositor: params.depositor,
          },
        );
      }

      if (params.recipient) {
        fundsDepositedQueryBuilder.andWhere("deposit.recipient = :recipient", {
          recipient: params.recipient,
        });
        depositForBurnQueryBuilder.andWhere(
          "COALESCE(sponsoredDepositForBurn.finalRecipient, depositForBurn.mintRecipient) = :recipient",
          {
            recipient: params.recipient,
          },
        );
        oftSentQueryBuilder.andWhere(
          "COALESCE(sponsoredOFTSend.finalRecipient, oftReceived.toAddress) = :recipient",
          {
            recipient: params.recipient,
          },
        );
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
      fundsDepositedQueryBuilder.andWhere(
        "fill.destinationChainId = :fillDestinationChainId",
        {
          fillDestinationChainId: params.destinationChainId,
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

    if (params.startBlock) {
      fundsDepositedQueryBuilder.andWhere(
        "deposit.blockNumber >= :startBlock",
        {
          startBlock: params.startBlock,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "depositForBurn.blockNumber >= :startBlock",
        {
          startBlock: params.startBlock,
        },
      );
      oftSentQueryBuilder.andWhere("oftSent.blockNumber >= :startBlock", {
        startBlock: params.startBlock,
      });
    }

    if (params.endBlock) {
      fundsDepositedQueryBuilder.andWhere("deposit.blockNumber <= :endBlock", {
        endBlock: params.endBlock,
      });
      depositForBurnQueryBuilder.andWhere(
        "depositForBurn.blockNumber <= :endBlock",
        {
          endBlock: params.endBlock,
        },
      );
      oftSentQueryBuilder.andWhere("oftSent.blockNumber <= :endBlock", {
        endBlock: params.endBlock,
      });
    }

    if (params.startFillBlock) {
      fundsDepositedQueryBuilder.andWhere(
        "fill.blockNumber >= :startFillBlock",
        {
          startFillBlock: params.startFillBlock,
        },
      );
      depositForBurnQueryBuilder.andWhere(
        "mintAndWithdraw.blockNumber >= :startFillBlock",
        {
          startFillBlock: params.startFillBlock,
        },
      );
      oftSentQueryBuilder.andWhere(
        "oftReceived.blockNumber >= :startFillBlock",
        {
          startFillBlock: params.startFillBlock,
        },
      );
    }

    if (params.endFillBlock) {
      fundsDepositedQueryBuilder.andWhere("fill.blockNumber <= :endFillBlock", {
        endFillBlock: params.endFillBlock,
      });
      depositForBurnQueryBuilder.andWhere(
        "mintAndWithdraw.blockNumber <= :endFillBlock",
        {
          endFillBlock: params.endFillBlock,
        },
      );
      oftSentQueryBuilder.andWhere("oftReceived.blockNumber <= :endFillBlock", {
        endFillBlock: params.endFillBlock,
      });
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
      nonce?: string;
      messageReceivedTxHash?: string;
      messageReceivedChainId?: string;
      guid?: string;
      oftReceivedTxHash?: string;
      oftReceivedChainId?: string;
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
        const isValidDestinationDomain =
          destinationDomain !== undefined &&
          destinationDomain !== null &&
          destinationDomain > -1;
        if (isValidDestinationDomain && !destinationChainId) {
          try {
            const derivedChainId =
              across.utils.getCctpDestinationChainFromDomain(
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

        if (isValidDestinationDomain && deposit.destinationChainId) {
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
        let fillTx = deposit.fillTx;
        let actionsTargetChainId: number | null =
          deposit.actionsTargetChainId ?? null;

        // For CCTP deposits, use the status function
        if (isValidDestinationDomain && deposit.nonce) {
          const statusResponse = await this.getDepositStatusForCctpDeposit(
            {
              chainId: deposit.originChainId,
              nonce: deposit.nonce,
              transactionHash: deposit.depositTxHash,
              destinationDomain: deposit.destinationDomain!,
            },
            deposit.messageReceivedTxHash && deposit.messageReceivedChainId
              ? {
                  transactionHash: deposit.messageReceivedTxHash,
                  chainId: deposit.messageReceivedChainId.toString(),
                }
              : null,
            0,
            0,
          );
          status =
            statusResponse.status === "pending"
              ? entities.RelayStatus.Unfilled
              : entities.RelayStatus.Filled;
          fillTx = statusResponse.fillTx ?? null;
          // TODO: convert response field type to number
          actionsTargetChainId = statusResponse.actionsTargetChainId ?? null;
        }
        // For OFT deposits, use the status function
        else if (
          deposit.destinationEndpointId &&
          !deposit.depositId &&
          deposit.guid
        ) {
          const statusResponse = await this.getDepositStatusForOftDeposit(
            {
              chainId: deposit.originChainId,
              guid: deposit.guid,
              transactionHash: deposit.depositTxHash,
            },
            deposit.oftReceivedTxHash && deposit.oftReceivedChainId
              ? {
                  transactionHash: deposit.oftReceivedTxHash,
                  chainId: deposit.oftReceivedChainId.toString(),
                }
              : null,
            0,
            0,
          );
          status =
            statusResponse.status === "pending"
              ? entities.RelayStatus.Unfilled
              : entities.RelayStatus.Filled;
          fillTx = statusResponse.fillTx ?? null;
          // TODO: convert response field type to number
          actionsTargetChainId = statusResponse.actionsTargetChainId ?? null;
        }
        // For Across deposits, use existing logic
        else {
          if (!status && deposit.fillTx) {
            status = entities.RelayStatus.Filled;
          } else if (!status) {
            status = entities.RelayStatus.Unfilled;
          }
        }

        /**
         * Destructure to exclude from the response:
         */
        const {
          destinationDomain: _,
          destinationEndpointId: __,
          messageReceivedTxHash,
          messageReceivedChainId,
          guid,
          nonce,
          ...depositWithoutDomain
        } = deposit;
        return {
          ...depositWithoutDomain,
          status: status,
          depositTxnRef: deposit.depositTxHash,
          depositRefundTxnRef: deposit.depositRefundTxHash,
          fillTx: fillTx,
          fillTxnRef: fillTx,
          originChainId: parseInt(deposit.originChainId),
          destinationChainId: destinationChainId,
          outputToken: outputToken,
          outputAmount: outputAmount,
          speedups,
          bridgeFeeUsd,
          actionsTargetChainId,
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
        (params.from && params.hypercoreWithdrawalNonce) ||
        (params.hypercoreDepositNonce && params.recipient)
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

    if (params.hypercoreDepositNonce && params.recipient) {
      // Hyperliquid Deposit status check
      return this.getHyperliquidDepositStatus(params);
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
      const cctpDeposit = matchingDeposit.deposit as entities.MessageSent & {
        receivedEvent: entities.MessageReceived;
      };
      return await this.getDepositStatusForCctpDeposit(
        {
          chainId: cctpDeposit.chainId,
          nonce: cctpDeposit.nonce,
          transactionHash: cctpDeposit.transactionHash,
          destinationDomain: cctpDeposit.destinationDomain!,
        },
        cctpDeposit.receivedEvent || null,
        index,
        taggedDeposits.length - 1,
      );
    }

    if (matchingDeposit.type === "oft") {
      const oftDeposit = matchingDeposit.deposit as entities.OFTSent & {
        receivedEvent: entities.OFTReceived;
      };
      return await this.getDepositStatusForOftDeposit(
        {
          chainId: oftDeposit.chainId,
          guid: oftDeposit.guid,
          transactionHash: oftDeposit.transactionHash,
        },
        oftDeposit.receivedEvent || null,
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

  private async getDepositStatusForCctpDeposit(
    deposit: {
      chainId: string;
      nonce: string;
      transactionHash: string;
      destinationDomain: number;
    },
    receivedEvent: {
      transactionHash: string;
      chainId: string;
    } | null,
    currentIndex: number,
    maxIndex: number,
  ) {
    let status: "pending" | "filled" = "pending";
    let fillTx: string | null = null;
    let actionsSucceeded: boolean | null = null;
    let actionsTargetChainId: number | null = null;
    let destinationChainId = utils.getCctpDestinationChainFromDomain(
      deposit.destinationDomain,
      true,
    );

    const sponsoredDepositForBurnEvent = await this.db
      .getRepository(entities.SponsoredDepositForBurn)
      .createQueryBuilder("sdfb")
      .where("sdfb.transactionHash = :txHash AND sdfb.chainId = :chainId", {
        txHash: deposit.transactionHash,
        chainId: deposit.chainId,
      })
      .getOne();

    if (sponsoredDepositForBurnEvent) {
      if (destinationChainId === CHAIN_IDs.HYPEREVM) {
        actionsTargetChainId = CHAIN_IDs.HYPERCORE;
      } else if (destinationChainId === CHAIN_IDs.MAINNET) {
        // after FE supports it, it should be changed to 2337
        actionsTargetChainId = null;
      }
    }

    // If no messageReceived event, the deposit is pending
    if (!receivedEvent) {
      status = "pending";
      fillTx = null;
    } else {
      const messageReceivedTxHash = receivedEvent.transactionHash;
      const messageReceivedChainId = receivedEvent.chainId;

      // Only check for sponsored flow events on HyperEVM
      const isHyperEVM =
        parseInt(messageReceivedChainId) === CHAIN_IDs.HYPEREVM;

      if (isHyperEVM) {
        // Query for sponsored flow events in parallel
        const [
          simpleTransferFlowCompleted,
          swapFlowInitialized,
          fallbackFlowCompleted,
        ] = await Promise.all([
          this.db
            .getRepository(entities.SimpleTransferFlowCompleted)
            .createQueryBuilder("stfc")
            .where(
              "stfc.transactionHash = :txHash AND stfc.chainId = :chainId",
              {
                txHash: messageReceivedTxHash,
                chainId: messageReceivedChainId,
              },
            )
            .getOne(),
          this.db
            .getRepository(entities.SwapFlowInitialized)
            .createQueryBuilder("sfi")
            .where("sfi.transactionHash = :txHash AND sfi.chainId = :chainId", {
              txHash: messageReceivedTxHash,
              chainId: messageReceivedChainId,
            })
            .getOne(),
          this.db
            .getRepository(entities.FallbackHyperEVMFlowCompleted)
            .createQueryBuilder("fhfc")
            .where(
              "fhfc.transactionHash = :txHash AND fhfc.chainId = :chainId",
              {
                txHash: messageReceivedTxHash,
                chainId: messageReceivedChainId,
              },
            )
            .getOne(),
        ]);

        // If SimpleTransferFlowCompleted exists, transfer is complete
        if (simpleTransferFlowCompleted) {
          status = "filled";
          fillTx = messageReceivedTxHash;
        }
        // If FallbackHyperEVMFlowCompleted exists, actions failed but transfer completed
        else if (fallbackFlowCompleted) {
          status = "filled";
          fillTx = fallbackFlowCompleted.transactionHash;
          actionsSucceeded = false;
          // fallback flow is not to HyperCore
          actionsTargetChainId = null;
        }
        // If SwapFlowInitialized exists, check for SwapFlowFinalized
        else if (swapFlowInitialized) {
          const swapFlowFinalized = await this.db
            .getRepository(entities.SwapFlowFinalized)
            .createQueryBuilder("sff")
            .where("sff.quoteNonce = :quoteNonce", {
              quoteNonce: swapFlowInitialized.quoteNonce,
            })
            .getOne();

          if (swapFlowFinalized) {
            status = "filled";
            fillTx = swapFlowFinalized.transactionHash;
            actionsSucceeded = true;
          } else {
            status = "pending";
            fillTx = null;
          }
        }
        // Default for HyperEVM: messageReceived exists but no sponsored flow events - transfer is filled
        else {
          status = "filled";
          fillTx = messageReceivedTxHash;
        }
      } else {
        // For non-HyperEVM chains, messageReceived means the transfer is filled
        status = "filled";
        fillTx = messageReceivedTxHash;
      }
    }

    return {
      status,
      originChainId: parseInt(deposit.chainId),
      depositId: deposit.nonce,
      depositTxHash: deposit.transactionHash,
      depositTxnRef: deposit.transactionHash,
      fillTx,
      fillTxnRef: fillTx,
      destinationChainId: receivedEvent
        ? parseInt(receivedEvent.chainId)
        : null,
      depositRefundTxHash: null,
      depositRefundTxnRef: null,
      actionsSucceeded,
      actionsTargetChainId,
      pagination: {
        currentIndex,
        maxIndex,
      },
    };
  }

  private async getDepositStatusForOftDeposit(
    deposit: {
      chainId: string;
      guid: string;
      transactionHash: string;
    },
    receivedEvent: {
      transactionHash: string;
      chainId: string;
    } | null,
    currentIndex: number,
    maxIndex: number,
  ) {
    let status: "pending" | "filled" = "pending";
    let fillTx: string | null = null;
    let actionsSucceeded: boolean | null = null;
    let actionsTargetChainId: number | null = null;

    // If no OFTReceived event, the deposit is pending
    if (!receivedEvent) {
      status = "pending";
      fillTx = null;
    } else {
      const oftReceivedTxHash = receivedEvent.transactionHash;
      const destinationChainId = receivedEvent.chainId;

      // Early exit for HyperEVM - no need to query SponsoredOFTSend if not HyperEVM
      const isHyperEVM = parseInt(destinationChainId) === CHAIN_IDs.HYPEREVM;

      // Check for SponsoredOFTSend on the origin chain (same transaction as OFTSent)
      // Only needed for HyperEVM chains
      let sponsoredOftSend = null;
      if (isHyperEVM) {
        sponsoredOftSend = await this.db
          .getRepository(entities.SponsoredOFTSend)
          .createQueryBuilder("sos")
          .where("sos.transactionHash = :txHash AND sos.chainId = :chainId", {
            txHash: deposit.transactionHash,
            chainId: deposit.chainId,
          })
          .getOne();
      }

      // If no sponsored OFT send, it's a simple transfer - use received event as fill
      if (!sponsoredOftSend) {
        status = "filled";
        fillTx = oftReceivedTxHash;
      } else {
        // Sponsored transfer - check for swap flow events on destination
        actionsTargetChainId = CHAIN_IDs.HYPERCORE;

        if (isHyperEVM && sponsoredOftSend.quoteNonce) {
          // Query for swap flow events in parallel
          const [
            swapFlowInitialized,
            swapFlowFinalized,
            fallbackFlowCompleted,
            simpleTransferFlowCompleted,
          ] = await Promise.all([
            this.db
              .getRepository(entities.SwapFlowInitialized)
              .createQueryBuilder("sfi")
              .where("sfi.quoteNonce = :quoteNonce", {
                quoteNonce: sponsoredOftSend.quoteNonce,
              })
              .getOne(),
            this.db
              .getRepository(entities.SwapFlowFinalized)
              .createQueryBuilder("sff")
              .where("sff.quoteNonce = :quoteNonce", {
                quoteNonce: sponsoredOftSend.quoteNonce,
              })
              .getOne(),
            this.db
              .getRepository(entities.FallbackHyperEVMFlowCompleted)
              .createQueryBuilder("fhfc")
              .where("fhfc.quoteNonce = :quoteNonce", {
                quoteNonce: sponsoredOftSend.quoteNonce,
              })
              .getOne(),
            this.db
              .getRepository(entities.SimpleTransferFlowCompleted)
              .createQueryBuilder("stfc")
              .where("stfc.quoteNonce = :quoteNonce", {
                quoteNonce: sponsoredOftSend.quoteNonce,
              })
              .getOne(),
          ]);

          // If swap flow is finalized, use that as the fill transaction
          if (swapFlowFinalized) {
            status = "filled";
            fillTx = swapFlowFinalized.transactionHash;
            actionsSucceeded = true;
          }
          // If fallback flow completed, actions failed but transfer completed
          else if (fallbackFlowCompleted) {
            status = "filled";
            fillTx = fallbackFlowCompleted.transactionHash;
            actionsSucceeded = false;
            actionsTargetChainId = null;
          }
          // If simple transfer flow completed, use that as the fill transaction
          else if (simpleTransferFlowCompleted) {
            status = "filled";
            fillTx = simpleTransferFlowCompleted.transactionHash;
            actionsSucceeded = true;
          }
          // If only initialized but not finalized or fallback, transfer is pending
          else if (swapFlowInitialized) {
            status = "pending";
            fillTx = null;
          }
          // No lzCompose executed - transfer is pending
          else {
            status = "pending";
            fillTx = null;
          }
        } else {
          // Sponsored transfer to non-HyperEVM chain or no quoteNonce - use received event
          status = "filled";
          fillTx = oftReceivedTxHash;
        }
      }
    }

    return {
      status,
      originChainId: parseInt(deposit.chainId),
      depositId: deposit.guid,
      depositTxHash: deposit.transactionHash,
      depositTxnRef: deposit.transactionHash,
      fillTx,
      fillTxnRef: fillTx,
      destinationChainId: receivedEvent
        ? parseInt(receivedEvent.chainId)
        : null,
      depositRefundTxHash: null,
      depositRefundTxnRef: null,
      actionsSucceeded,
      actionsTargetChainId,
      pagination: {
        currentIndex,
        maxIndex,
      },
    };
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

  private async getHyperliquidDepositStatus(params: DepositStatusParams) {
    const cacheKey = this.getDepositStatusCacheKey(params);
    const repo = this.db.getRepository(entities.HyperliquidDeposit);

    // Normalize the nonce to string and recipient to lowercase for comparison
    const nonce = params.hypercoreDepositNonce?.toString() || "";
    const recipient = params.recipient?.toLowerCase() || "";

    const deposit = await repo.findOne({
      where: {
        nonce: nonce,
        user: recipient,
      },
    });

    if (!deposit) {
      throw new HyperliquidDepositNotFoundException();
    }

    // Find the CCTP burn event using the transaction hash
    const depositForBurn = await findCctpBurnEventForHyperliquidDeposit(
      this.db,
      deposit.transactionHash,
    );

    if (!depositForBurn) {
      throw new HyperliquidDepositNotFoundException();
    }

    const depositTxnRef = depositForBurn.transactionHash;
    const originChainId = parseInt(depositForBurn.chainId);

    const result = {
      status: "filled",
      originChainId: originChainId,
      depositId: params.hypercoreDepositNonce as string,
      depositTxnRef: depositTxnRef,
      fillTxnRef: deposit.transactionHash,
      destinationChainId: CHAIN_IDs.HYPERCORE,
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

  public async getHyperliquidTransfers(
    params: HyperliquidTransfersParams,
  ): Promise<HyperliquidTransferResponse[]> {
    const user = params.user.toLowerCase();
    const skip = params.skip || 0;
    const limit = params.limit || 50;

    if (params.direction === "in") {
      // Fetch deposits from hyperliquid_deposit table with pagination
      const repo = this.db.getRepository(entities.HyperliquidDeposit);
      const deposits = await repo.find({
        where: {
          user: user,
        },
        order: {
          blockTimestamp: "DESC",
        },
        skip: skip,
        take: limit,
      });

      // Process deposits with async operations
      const results = await Promise.all(
        deposits.map(async (deposit) => {
          // Find the CCTP burn event using the transaction hash
          const depositForBurn = await findCctpBurnEventForHyperliquidDeposit(
            this.db,
            deposit.transactionHash,
          );

          const depositTxnRef = depositForBurn?.transactionHash || null;
          const originChainId = depositForBurn
            ? parseInt(depositForBurn.chainId)
            : null;

          return {
            depositTxnRef: depositTxnRef,
            fillTxnRef: deposit.transactionHash,
            originChainId: originChainId,
            destinationChainId: CHAIN_IDs.HYPERCORE,
            amount: deposit.amount,
            token: deposit.token,
            nonce: deposit.nonce,
            destinationBlockTimestamp: deposit.blockTimestamp,
          };
        }),
      );

      return results;
    } else {
      // Fetch withdrawals from hypercore_cctp_withdraw table with pagination
      // Use case-insensitive comparison since API normalizes addresses to lowercase
      // but database stores them in checksummed/mixed case format
      const repo = this.db.getRepository(entities.HypercoreCctpWithdraw);
      const withdrawals = await repo
        .createQueryBuilder("withdrawal")
        .leftJoinAndSelect("withdrawal.burnEvent", "burnEvent")
        .leftJoinAndSelect("withdrawal.mintEvent", "mintEvent")
        .where("LOWER(withdrawal.fromAddress) = LOWER(:user)", {
          user: params.user,
        })
        .orderBy("withdrawal.createdAt", "DESC")
        .skip(skip)
        .take(limit)
        .getMany();

      return withdrawals.map((withdrawal) => {
        return {
          depositTxnRef:
            withdrawal.burnTxnHash ||
            withdrawal.burnEvent?.transactionHash ||
            null,
          fillTxnRef:
            withdrawal.mintTxnHash ||
            withdrawal.mintEvent?.transactionHash ||
            null,
          originChainId: withdrawal.originChainId
            ? parseInt(withdrawal.originChainId)
            : null,
          destinationChainId: withdrawal.destinationChainId
            ? parseInt(withdrawal.destinationChainId)
            : null,
          nonce: withdrawal.hypercoreNonce,
          destinationBlockTimestamp: withdrawal.createdAt, // Timestamp of the block on the destination chain
        };
      });
    }
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

    if (params.hypercoreDepositNonce && params.recipient) {
      return `depositStatus-${params.hypercoreDepositNonce}-${params.recipient}`;
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
