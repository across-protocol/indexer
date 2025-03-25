import Redis from "ioredis";
import { DateTime } from "luxon";
import winston from "winston";
import { Job, Worker } from "bullmq";
import { DataSource, entities } from "@repo/indexer-database";
import { ethers } from "ethers";
import { assert } from "@repo/error-handling";
import * as across from "@across-protocol/sdk";
import * as constants from "@across-protocol/constants";
import * as ss from "superstruct";

import { IndexerQueues } from "./service";
import { findTokenByAddress, yesterday } from "../utils";

export const PriceMessage = ss.object({
  fillEventId: ss.number(),
});

export type PriceMessage = ss.Infer<typeof PriceMessage>;

export type PriceWorkerConfig = {
  coingeckoApiKey?: string;
};

type CGHistoricPrice = {
  id: string;
  symbol: string;
  name: string;
  market_data?: {
    current_price: {
      usd: number;
    };
  };
};

/**
 * This worker listens to the `PriceQuery` queue and processes each job by:
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
  private historicPriceRepository;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
    private config: PriceWorkerConfig,
  ) {
    this.coingeckoClient = across.coingecko.Coingecko.get(
      logger,
      config.coingeckoApiKey,
    );
    this.relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
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
  ): Promise<number | undefined> {
    const priceTime = yesterday(time);
    const tokenInfo = findTokenByAddress(address, chainId);
    if (!tokenInfo) {
      return undefined;
    }
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
            message: `Error getting price for fill on fill event id ${job.data.fillEventId}`,
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
    const { fillEventId } = params;

    const relayHashInfo = await this.relayHashInfoRepository.findOne({
      where: { fillEventId },
      relations: {
        fillEvent: true,
      },
    });

    if (!relayHashInfo) {
      const errorMessage = `Relay hash info not found by id ${fillEventId}`;
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      // this should end the request if the entity cant be found by id. it will never be there
      return;
    }

    if (!relayHashInfo.fillEvent) {
      const errorMessage = "Fill event not found for relay hash info.";
      this.logger.error({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      return;
    }

    if (
      relayHashInfo.bridgeFeeUsd &&
      relayHashInfo.inputPriceUsd &&
      relayHashInfo.outputPriceUsd
    ) {
      const errorMessage = "Skipping already processed relay hash";
      this.logger.warn({
        at: "PriceWorker",
        message: errorMessage,
        ...params,
      });
      return;
    }

    // we are getting our price timestamp off fill event time rather than deposit, this should be pretty close to deposit, and we only look up previous 24 hour price anywyay
    // if blockTimestamp doesnt exist, maybe we keep retrying till it does
    const blockTime = relayHashInfo.fillEvent.blockTimestamp;
    if (!blockTime) {
      const errorMessage = "Block time not found for relay hash info.";
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
    const inputTokenInfo = findTokenByAddress(
      inputTokenAddress,
      relayHashInfo.originChainId,
    );
    if (!inputTokenInfo) {
      return;
    }
    const outputTokenInfo = findTokenByAddress(
      outputTokenAddress,
      destinationChainId,
    );
    if (!outputTokenInfo) {
      return;
    }
    const inputTokenPrice = await this.getPrice(
      inputTokenAddress,
      relayHashInfo.originChainId,
      blockTime,
    );
    if (!inputTokenPrice) {
      return;
    }
    const outputTokenPrice = await this.getPrice(
      outputTokenAddress,
      destinationChainId,
      blockTime,
    );
    if (!outputTokenPrice) {
      return;
    }
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

    let gasTokenPriceUsd: string | undefined;
    let gasFeeUsd: string | undefined;

    if (relayHashInfo.gasFee) {
      const destinationChainNativeTokenSymbol =
        constants.PUBLIC_NETWORKS[Number(relayHashInfo.destinationChainId)]
          ?.nativeToken;
      if (!destinationChainNativeTokenSymbol) {
        throw new Error(
          `Destination chain native token symbol not found for chain id ${relayHashInfo.destinationChainId}`,
        );
      }
      const nativeToken =
        constants.TOKEN_SYMBOLS_MAP[
          destinationChainNativeTokenSymbol as keyof typeof constants.TOKEN_SYMBOLS_MAP
        ];
      if (!nativeToken) {
        throw new Error(
          `Native token not found for symbol ${destinationChainNativeTokenSymbol}`,
        );
      }
      const nativeTokenPlatformId = nativeToken.coingeckoId;
      if (!nativeTokenPlatformId) {
        throw new Error(
          `Native token platform id not found for symbol ${destinationChainNativeTokenSymbol}`,
        );
      }
      const nativeTokenPrice = await this.getHistoricalPriceByPlatformId(
        nativeTokenPlatformId,
        blockTime,
      );
      const gasFeeBigInt = BigInt(relayHashInfo.gasFee);
      const nativeTokenPriceBigInt = BigInt(
        Math.round(nativeTokenPrice * Math.pow(10, 18)),
      );
      const normalizedGasFee =
        (gasFeeBigInt * nativeTokenPriceBigInt) /
        BigInt(Math.pow(10, nativeToken.decimals));
      gasFeeUsd = ethers.utils.formatEther(normalizedGasFee);
      gasTokenPriceUsd = nativeTokenPrice.toString();
    }

    const updatedFields: Partial<typeof relayHashInfo> = {
      gasTokenPriceUsd,
      gasFeeUsd,
    };

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
      await this.relayHashInfoRepository.update({ fillEventId }, updatedFields);
      this.logger.debug({
        at: "PriceWorker#updateRelayHashInfo",
        message: "Updated relay hash info with new fields",
        params,
        updatedFields,
      });
    }
  }

  private async getHistoricalPriceByPlatformId(platformId: string, date: Date) {
    const priceTime = yesterday(date);
    const cgFormattedDate =
      DateTime.fromJSDate(priceTime).toFormat("dd-LL-yyyy");
    const response = await this.coingeckoClient.call<CGHistoricPrice>(
      `/coins/${platformId}/history?date=${cgFormattedDate}`,
    );
    const usdPrice = response.market_data?.current_price?.usd;
    if (!usdPrice) {
      throw new Error(
        `Coingecko call returned no price for platform id ${platformId} at ${cgFormattedDate}`,
      );
    }
    return usdPrice;
  }

  public async close() {
    return this.worker.close();
  }
}
