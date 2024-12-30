import Redis from "ioredis";
import winston from "winston";
import { Job, Worker } from "bullmq";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import { ethers } from "ethers";
import {
  getIntegratorId,
  yesterday,
  CoingeckoClient,
  findTokenByAddress,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { assert } from "@repo/error-handling";

export type PriceMessage = {
  depositId: number;
  originChainId: number;
};

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
  private coingeckoClient: CoingeckoClient;
  private relayHashInfoRepository;
  private depositRepository;
  private historicPriceRepository;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
  ) {
    this.coingeckoClient = new CoingeckoClient();
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
    const baseCurrency = tokenInfo.coingeckoId;

    const cachedPrice = await this.historicPriceRepository.findOne({
      where: {
        date: priceTime,
        baseCurrency,
        quoteCurrency,
      },
    });
    // we have this price at this time in the db
    if (cachedPrice) return Number(cachedPrice.price);

    const fetchedPrice = await this.coingeckoClient.getHistoricDailyPrice(
      priceTime.getTime(),
      baseCurrency,
    );
    const price = fetchedPrice.market_data?.current_price[quoteCurrency];
    assert(
      price,
      `Unable to fetch price for ${quoteCurrency} in ${baseCurrency} at ${priceTime}`,
    );
    await this.historicPriceRepository.insert({
      date: priceTime,
      baseCurrency,
      quoteCurrency,
      price: price.toString(),
    });

    return Number(price);
  }

  public setWorker() {
    this.worker = new Worker(
      IndexerQueues.PriceQuery,
      async (job: Job<PriceMessage>) => {
        try {
          await this.run(job.data);
        } catch (error) {
          this.logger.error({
            at: "PriceWorker",
            message: `Error getting price for deposit ${job.data.depositId} on chain ${job.data.originChainId}`,
            error,
          });
          throw error;
        }
      },
      { connection: this.redis, concurrency: 10 },
    );
  }
  // price is assumed to be a float, amount is assumed in wei and decimals is the conversion for that amount
  // this outputs the difference between input and output normalized to the price which is typically usd
  private calculateBridgeFee(
    inputToken: { amount: string; price: number; decimals: number },
    outputToken: { amount: string; price: number; decimals: number },
  ): bigint {
    const inputAmountBigInt = BigInt(inputToken.amount);
    const outputAmountBigInt = BigInt(outputToken.amount);

    const inputPriceBigInt = BigInt(
      Math.round(inputToken.price * Math.pow(10, inputToken.decimals)),
    );
    const outputPriceBigInt = BigInt(
      Math.round(outputToken.price * Math.pow(10, outputToken.decimals)),
    );

    const normalizedInputAmount =
      (inputAmountBigInt * inputPriceBigInt) /
      BigInt(Math.pow(10, inputToken.decimals));
    const normalizedOutputAmount =
      (outputAmountBigInt * outputPriceBigInt) /
      BigInt(Math.pow(10, outputToken.decimals));

    return normalizedInputAmount - normalizedOutputAmount;
  }
  private async run(params: PriceMessage) {
    const { depositId, originChainId } = params;

    const relayHashInfo = await this.relayHashInfoRepository.findOne({
      where: { depositId, originChainId },
    });
    const deposit = await this.depositRepository.findOne({
      where: { depositId, originChainId },
    });

    // This is catastrophic, we dont want worker retrying if we cannot find this data
    if (!relayHashInfo || !deposit) {
      this.logger.error({
        at: "PriceWorker",
        message:
          "Failed to retrieve relay hash information or deposit record from the database.",
        ...params,
      });
      return;
    }

    // if blockTimestamp doesnt exist, maybe we keep retrying till it does
    const blockTime = relayHashInfo?.depositEvent?.blockTimestamp;
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

    const bridgeFee = this.calculateBridgeFee(inputToken, outputToken);
    relayHashInfo.bridgeFeeUsd = bridgeFee.toString();
    await this.relayHashInfoRepository.save(relayHashInfo);
  }
  public async close() {
    return this.worker.close();
  }
}
