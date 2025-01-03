import Redis from "ioredis";
import winston from "winston";
import { DateTime } from "luxon";
import { Job, Worker } from "bullmq";
import * as across from "@across-protocol/sdk";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import { ethers } from "ethers";
import { assert } from "@repo/error-handling";
import {
  findTokenByAddress,
  isV3FundsDepositedEvent,
  isSwapBeforeBridgeEvent,
  decodeSwapBeforeBridgeEvent,
  decodeV3FundsDepositedLog,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import * as s from "superstruct";
import { receiveMessageOnPort } from "worker_threads";

export const SwapMessage = s.object({
  // confusingly the deposit event entity database id is named depositEventId in relayhashinfo
  // we want to point to the database id, not the on chain id
  originChainId: s.number(),
  transactionHash: s.string(),
});

export type SwapMessage = s.Infer<typeof SwapMessage>;

// Convert now to a consistent price timestamp yesterday for lookup purposes
export function yesterday(now: Date) {
  return DateTime.fromJSDate(now)
    .minus({ days: 1 })
    .set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
    .toJSDate();
}

export class SwapWorker {
  private worker: Worker;
  private depositRepository;
  private historicPriceRepository;
  private relayHashInfoRepository;
  private swapBeforeBridgeRepository;
  private coingeckoClient: across.coingecko.Coingecko;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private logger: winston.Logger,
  ) {
    this.depositRepository = this.postgres.getRepository(
      entities.V3FundsDeposited,
    );
    this.historicPriceRepository = this.postgres.getRepository(
      entities.HistoricPrice,
    );
    this.relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    this.swapBeforeBridgeRepository = this.postgres.getRepository(
      entities.SwapBeforeBridgeEvent,
    );
    this.coingeckoClient = across.coingecko.Coingecko.get(logger);
    this.setWorker();
  }
  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.SwapMessage,
      async (job: Job<unknown>) => {
        const [error, data] = s.validate(job.data, SwapMessage);
        if (error) {
          this.logger.error({
            at: "SwapWorker",
            message: "Invalid job data",
            error,
          });
          return;
        }
        try {
          await this.run(data);
        } catch (error) {
          this.logger.error({
            at: "SwapWorker",
            message: `Error getting swap infor for hash ${data.transactionHash} on chain ${data.originChainId}`,
            error,
          });
          throw error;
        }
      },
      { connection: this.redis, concurrency: 10 },
    );
  }
  private async getPrice(
    address: string,
    chainId: number,
    time: Date,
    quoteCurrency = "usd",
  ): Promise<number> {
    const priceTime = yesterday(time);
    const tokenInfo = findTokenByAddress(address, chainId);
    const baseCurrency = tokenInfo.symbol;

    const cachedPrice = await this.historicPriceRepository.findOne({
      where: {
        date: priceTime,
        baseCurrency,
        quoteCurrency,
      },
    });
    // we have this price at this time in the db
    if (cachedPrice) {
      return Number(cachedPrice.price);
    }

    const cgFormattedDate =
      DateTime.fromJSDate(priceTime).toFormat("dd-LL-yyyy");
    const price = await this.coingeckoClient.getContractHistoricDayPrice(
      address,
      cgFormattedDate,
      quoteCurrency,
      chainId,
    );
    assert(
      price,
      `Unable to fetch price for ${quoteCurrency} in ${baseCurrency}(${tokenInfo.coingeckoId}) at ${priceTime}`,
    );
    // upsert to prevent conflicts with price worker inserts
    await this.historicPriceRepository.upsert(
      {
        date: priceTime,
        baseCurrency,
        quoteCurrency,
        price: price.toString(),
      },
      ["date", "baseCurrency", "quoteCurrency"],
    );

    return Number(price);
  }
  private async run(params: SwapMessage) {
    const { originChainId, transactionHash } = params;
    const provider =
      this.retryProvidersFactory.getProviderForChainId(originChainId);
    const transactionReceipt =
      await provider.getTransactionReceipt(transactionHash);
    this.logger.info({
      at: "SwapWorker",
      message: "Running swap worker",
      originChainId,
      transactionHash,
    });

    const pairedEvents = [];
    let lastSwapEvent = null;

    // Sort the transaction logs by their log index to ensure they are processed in the order they were recorded.
    const sortedLogs = transactionReceipt.logs.sort(
      (a, b) => a.logIndex - b.logIndex,
    );

    // Iterate over each log in the sorted logs.
    for (const log of sortedLogs) {
      // Check if the log is a SwapBeforeBridge event.
      if (isSwapBeforeBridgeEvent(log)) {
        // Decode the SwapBeforeBridge event and store it with its log index.
        const swapEvent = decodeSwapBeforeBridgeEvent(log);
        lastSwapEvent = { ...swapEvent, logIndex: log.logIndex };
      }
      // Check if the log is a V3FundsDeposited event and there is a preceding SwapBeforeBridge event.
      else if (isV3FundsDepositedEvent(log) && lastSwapEvent) {
        // Decode the V3FundsDeposited event and pair it with the last SwapBeforeBridge event.
        const depositEvent = decodeV3FundsDepositedLog(log);
        pairedEvents.push({
          swapEvent: lastSwapEvent,
          depositEvent: { ...depositEvent, logIndex: log.logIndex },
        });
        // Reset lastSwapEvent to null after pairing to ensure each swap is only paired once.
        lastSwapEvent = null;
      }
    }

    this.logger.info({
      at: "SwapWorker",
      message: "Paired swap and deposit events",
      pairedEventsCount: pairedEvents.length,
    });

    for (const { swapEvent, depositEvent } of pairedEvents) {
      const deposit = await this.depositRepository.findOne({
        where: {
          originChainId,
          transactionHash,
          blockNumber: transactionReceipt.blockNumber,
          logIndex: depositEvent.logIndex,
        },
      });

      if (!deposit || deposit.blockTimestamp === undefined) {
        this.logger.error({
          at: "SwapWorker",
          message: "Failed to retrieve deposit from database.",
          depositId: depositEvent.depositId,
        });
        throw new Error("Failed to retrieve deposit from database.");
      }

      await this.swapBeforeBridgeRepository.update(
        {
          originChainId,
          transactionHash,
          blockHash: transactionReceipt.blockHash,
          logIndex: swapEvent.logIndex,
        },
        {
          depositId: deposit.depositId,
          depositEventId: deposit.id,
        },
      );
      const {
        acrossInputToken,
        acrossOutputToken,
        swapToken,
        swapTokenAmount,
        acrossInputAmount,
      } = swapEvent;
      const inputTokenInfo = findTokenByAddress(
        acrossInputToken,
        originChainId,
      );
      const outputTokenInfo = findTokenByAddress(
        acrossOutputToken,
        originChainId,
      );

      const inputPriceUsd = await this.getPrice(
        swapToken,
        originChainId,
        deposit.blockTimestamp,
      );
      const outputPriceUsd = await this.getPrice(
        acrossInputToken,
        originChainId,
        deposit.blockTimestamp,
      );
      const swapInputTokenName = inputTokenInfo.name;
      const swapOutputTokenName = outputTokenInfo.name;
      const swapInputAmountUsd = swapTokenAmount * inputPriceUsd;
      const swapOutputAmountUsd = acrossInputAmount * outputPriceUsd;
      const swapFeeUsdAmount = swapInputAmountUsd - swapOutputAmountUsd;
      // this calculation is very innaccurate but gives us a ballpark of input tokens lost during swap
      const swapFeeInputAmount = swapFeeUsdAmount / inputPriceUsd;
      this.relayHashInfoRepository.update(
        // this is deposit entity id, unique to database
        { depositEventId: deposit.id },
        {
          swapInputTokenName,
          swapOutputTokenName,
          swapFeeInputAmount: swapFeeInputAmount.toString(),
          swapFeeUsdAmount: swapFeeUsdAmount.toString(),
        },
      ),
        this.logger.info({
          at: "SwapWorker",
          message: "Updated swapBeforeBridge event with deposit details",
          depositId: deposit.id,
        });
    }
  }
  public async close() {
    return this.worker.close();
  }
}
