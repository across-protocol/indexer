import Redis from "ioredis";
import winston from "winston";
import { Job, Worker } from "bullmq";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import {
  getIntegratorId,
  yesterday,
  CoingeckoClient,
  findTokenByAddress,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

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
  public worker: Worker;
  private coingeckoClient: CoingeckoClient;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private logger: winston.Logger,
  ) {
    this.coingeckoClient = new CoingeckoClient();
    this.setWorker();
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
  private async run(params: PriceMessage) {
    const { depositId, originChainId } = params;
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    const depositRepository = this.postgres.getRepository(
      entities.V3FundsDeposited,
    );
    const historicPriceRepository = this.postgres.getRepository(
      entities.HistoricPrice,
    );

    const relayHashInfo = await relayHashInfoRepository.findOne({
      where: { depositId, originChainId },
    });
    const deposit = await depositRepository.findOne({
      where: { depositId, originChainId },
    });

    if (!relayHashInfo || !deposit) {
      this.logger.error({
        at: "PriceWorker",
        message: "Relay hash info not found",
        ...params,
      });
      return;
    }

    const blockTime = relayHashInfo?.depositEvent?.blockTimestamp;
    if (!blockTime) {
      this.logger.error({
        at: "PriceWorker",
        message: "Deposit block time not found for relay hash info",
        ...params,
      });
      return;
    }
    const priceTime = yesterday(blockTime);
    const quoteCurrency = "usd";
    const baseTokenInfo = findTokenByAddress(
      relayHashInfo.fillEvent.outputToken,
      relayHashInfo.destinationChainId,
    );
    const baseCurrency = baseTokenInfo?.coingeckoId;
    let price: undefined | number;

    if (!baseCurrency) {
      this.logger.error({
        at: "PriceWorker",
        message: "Unable to find base currency to quote",
        ...params,
        outputToken: relayHashInfo.fillEvent.outputToken,
        destinationChainId: relayHashInfo.destinationChainId,
      });
      return;
    }
    const existingPrice = await historicPriceRepository.findOne({
      where: {
        date: priceTime,
        baseCurrency,
        quoteCurrency,
      },
    });
    // fetch price if one hasnt been saved
    if (!existingPrice) {
      try {
        const historicPriceData =
          await this.coingeckoClient.getHistoricDailyPrice(
            priceTime.getTime(),
            baseCurrency,
          );
        price = historicPriceData.market_data?.current_price[quoteCurrency];
        // wasnt able to get a price
        if (price === undefined) {
          this.logger.error(
            `Unable to find ${quoteCurrency} for ${baseCurrency} at time ${priceTime}`,
          );
          return;
        }
        await historicPriceRepository.insert({
          date: priceTime,
          baseCurrency,
          quoteCurrency,
          price: price.toString(),
        });
        this.logger.info({
          at: "PriceWorker",
          ...params,
          message: `Fetched and inserted historic price for ${baseCurrency} on ${priceTime}`,
        });
      } catch (error) {
        this.logger.error({
          at: "PriceWorker",
          ...params,
          message: `Failed to fetch or insert historic price for ${baseCurrency} on ${priceTime}`,
          error: (error as Error).message,
        });
      }
    } else {
      price = Number(existingPrice.price);
    }

    if (price === undefined) {
      this.logger.error({
        at: "PriceWorker",
        ...params,
        message: "Failed to get a valid price from cache or coingecko",
      });
      return;
    }
    // TODO: Compute bridge fee
  }
  public async close() {
    return this.worker.close();
  }
}
