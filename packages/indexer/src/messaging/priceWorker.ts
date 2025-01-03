import Redis from "ioredis";
import { DateTime } from "luxon";
import winston from "winston";
import { Job, Worker } from "bullmq";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import { ethers } from "ethers";
import { findTokenByAddress } from "../utils";
// import { CoingeckoClient } from "../utils/coingeckoClient";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { assert } from "@repo/error-handling";
import * as across from "@across-protocol/sdk";
import * as ss from "superstruct";

export const PriceMessage = ss.object({
  relayHash: ss.string(),
  originChainId: ss.number(),
});

export type PriceMessage = ss.Infer<typeof PriceMessage>;

// Convert now to a consistent price timestamp yesterday for lookup purposes
export function yesterday(now: Date) {
  return DateTime.fromJSDate(now)
    .minus({ days: 1 })
    .set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
    .toJSDate();
}

/**
 * This worker listens to the `PriceQuery` queue and processes each job by:
 * - Retrieving the deposit and relay hash information from the database using the deposit ID and origin chain ID.
 * - Verifying the existence of the relay hash info and deposit records.
 * - Determining the block time from the relay hash info and calculating the price time as the previous day's timestamp.
 * - Identifying the base currency using the output token and destination chain ID.
 * - Checking if a historic price for the base currency and quote currency (USD) already exists in the database.
 * - If not, fetching the historic price from Coingecko and inserting it into the database.
 * - Logging errors and information at various stages of the process.
 */
export class PriceWorker {
  private worker: Worker;
  private coingeckoClient: across.coingecko.Coingecko;
  private relayHashInfoRepository;
  private depositRepository;
  private historicPriceRepository;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
  ) {
    this.coingeckoClient = across.coingecko.Coingecko.get(logger);
    this.relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    this.depositRepository = this.postgres.getRepository(
      entities.V3FundsDeposited,
    );
    this.historicPriceRepository = this.postgres.getRepository(
      entities.HistoricPrice,
    );
    this.setWorker();
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
    // upsert to prevent conflicts with swap worker inserts
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

  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.PriceQuery,
      async (job: Job<unknown>) => {
        // validate data type
        if (!ss.is(job.data, PriceMessage)) return;
        try {
          await this.run(job.data);
        } catch (error) {
          this.logger.error({
            at: "PriceWorker",
            message: `Error getting price for fill ${job.data.relayHash}`,
            error,
            job,
          });
          throw error;
        }
      },
      { connection: this.redis, concurrency: 10 },
    );
  }
  // price is assumed to be a float, amount is assumed in wei and decimals is the conversion for that amount
  // this outputs the difference between input and output normalized to the price which is typically usd
  private static calculateBridgeFee(
    inputToken: { amount: string; price: number; decimals: number },
    outputToken: { amount: string; price: number; decimals: number },
  ): string {
    // Convert input token amount from string to BigInt for precise arithmetic operations
    const inputAmountBigInt = BigInt(inputToken.amount);
    // Convert output token amount from string to BigInt for precise arithmetic operations
    const outputAmountBigInt = BigInt(outputToken.amount);

    // Convert input token price to BigInt by scaling it according to its decimals
    // This involves rounding the price to the nearest integer after multiplying by 10^decimals
    const inputPriceBigInt = BigInt(
      Math.round(inputToken.price * Math.pow(10, 18)),
    );
    // Convert output token price to BigInt by scaling it according to its decimals
    // This involves rounding the price to the nearest integer after multiplying by 10^decimals
    const outputPriceBigInt = BigInt(
      Math.round(outputToken.price * Math.pow(10, 18)),
    );

    // Normalize the input amount by multiplying it with its price and dividing by 10^decimals
    // This converts the amount to a common scale based on its price
    const normalizedInputAmount =
      (inputAmountBigInt * inputPriceBigInt) /
      BigInt(Math.pow(10, inputToken.decimals));
    // Normalize the output amount by multiplying it with its price and dividing by 10^decimals
    // This converts the amount to a common scale based on its price
    const normalizedOutputAmount =
      (outputAmountBigInt * outputPriceBigInt) /
      BigInt(Math.pow(10, outputToken.decimals));

    // Calculate the bridge fee by subtracting the normalized output amount from the normalized input amount
    // This gives the difference in value between the input and output tokens
    return ethers.utils.formatEther(
      normalizedInputAmount - normalizedOutputAmount,
    );
  }
  private async run(params: PriceMessage) {
    const { relayHash, originChainId } = params;

    const relayHashInfo = await this.relayHashInfoRepository.findOne({
      where: { relayHash, originChainId },
      relations: {
        depositEvent: true,
        fillEvent: true,
      },
    });

    if (!relayHashInfo) {
      const errorMessage = `Relay hash info not found by relay hash ${relayHash}`;
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      throw new Error(errorMessage);
    }

    const { depositId } = relayHashInfo;
    const deposit = await this.depositRepository.findOne({
      where: { depositId, originChainId },
    });

    if (!deposit) {
      const errorMessage = `Unable to find deposit ${depositId} on chain ${originChainId}`;
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      throw new Error(errorMessage);
    }

    if (
      relayHashInfo.bridgeFeeUsd &&
      relayHashInfo.inputPriceUsd &&
      relayHashInfo.outputPriceUsd
    ) {
      const errorMessage = "Skipping already processed relay hash";
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      return;
    }
    const errorMessage =
      "Failed to retrieve relay hash information or deposit record from the database.";

    // if blockTimestamp doesnt exist, maybe we keep retrying till it does
    const blockTime = relayHashInfo.depositEvent.blockTimestamp;
    if (!blockTime) {
      const errorMessage = "Deposit block time not found for relay hash info.";
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      throw new Error(errorMessage);
    }
    const inputTokenAddress = relayHashInfo.fillEvent.inputToken;
    const outputTokenAddress = relayHashInfo.fillEvent.outputToken;
    const destinationChainId = relayHashInfo.destinationChainId;
    const inputTokenInfo = findTokenByAddress(inputTokenAddress, originChainId);
    const outputTokenInfo = findTokenByAddress(
      outputTokenAddress,
      destinationChainId,
    );

    const inputTokenPrice = await this.getPrice(
      inputTokenAddress,
      originChainId,
      blockTime,
    );
    const outputTokenPrice = await this.getPrice(
      outputTokenAddress,
      destinationChainId,
      blockTime,
    );

    const inputToken = {
      amount: relayHashInfo.fillEvent.inputAmount,
      price: inputTokenPrice,
      decimals: inputTokenInfo.decimals,
    };

    const outputToken = {
      amount: relayHashInfo.fillEvent.outputAmount,
      price: outputTokenPrice,
      decimals: outputTokenInfo.decimals,
    };

    const bridgeFee = PriceWorker.calculateBridgeFee(inputToken, outputToken);
    const updatedFields: Partial<typeof relayHashInfo> = {};

    if (relayHashInfo.bridgeFeeUsd !== bridgeFee.toString()) {
      updatedFields.bridgeFeeUsd = bridgeFee.toString();
    }
    if (Number(relayHashInfo.inputPriceUsd) !== inputTokenPrice) {
      updatedFields.inputPriceUsd = inputTokenPrice.toString();
    }
    if (Number(relayHashInfo.outputPriceUsd) !== outputTokenPrice) {
      updatedFields.outputPriceUsd = outputTokenPrice.toString();
    }

    if (Object.keys(updatedFields).length > 0) {
      await this.relayHashInfoRepository.update(
        { depositId, originChainId },
        updatedFields,
      );
      this.logger.info({
        at: "PriceWorker#updateRelayHashInfo",
        message: "Updated relay hash info with new fields",
        params,
        updatedFields,
      });
    }
  }
  public async close() {
    return this.worker.close();
  }
}
