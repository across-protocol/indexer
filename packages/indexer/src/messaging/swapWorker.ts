import Redis from "ioredis";
import winston from "winston";
import { DateTime } from "luxon";
import { Job, Worker } from "bullmq";
import * as across from "@across-protocol/sdk";
import * as s from "superstruct";
import { ethers } from "ethers";
import { DataSource, entities } from "@repo/indexer-database";
import { assert } from "@repo/error-handling";
import { IndexerQueues } from "./service";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { findTokenByAddress, Token, yesterday } from "../utils";

export const SwapMessage = s.object({
  swapEventId: s.number(),
});

export type SwapWorkerConfig = {
  coingeckoApiKey?: string;
};

export type SwapMessage = s.Infer<typeof SwapMessage>;

export class SwapWorker {
  private worker: Worker;
  private historicPriceRepository;
  private relayHashInfoRepository;
  private depositRepository;
  private swapBeforeBridgeRepository;
  private coingeckoClient: across.coingecko.Coingecko;

  constructor(
    private redis: Redis,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private logger: winston.Logger,
    private config: SwapWorkerConfig,
  ) {
    this.historicPriceRepository = this.postgres.getRepository(
      entities.HistoricPrice,
    );
    this.relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    this.depositRepository = this.postgres.getRepository(
      entities.V3FundsDeposited,
    );
    this.swapBeforeBridgeRepository = this.postgres.getRepository(
      entities.SwapBeforeBridge,
    );
    this.coingeckoClient = across.coingecko.Coingecko.get(
      logger,
      config.coingeckoApiKey,
    );
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
            message: `Error getting swap info for hash ${data.swapEventId}`,
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
  ): Promise<{ price: number; tokenInfo: Token } | undefined> {
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
      return {
        price: Number(cachedPrice.price),
        tokenInfo,
      };
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

    return {
      price: Number(price),
      tokenInfo,
    };
  }

  private async run(params: SwapMessage) {
    const { swapEventId } = params;
    const relayHashInfo = await this.relayHashInfoRepository.findOne({
      where: { swapBeforeBridgeEventId: swapEventId },
    });
    if (!relayHashInfo || !relayHashInfo.depositEventId) {
      this.logger.warn({
        at: "SwapWorker",
        message: `Relay hash info not found for id ${swapEventId}`,
      });
      return;
    }
    // a relay hash info with a swap event id should always have a deposit event id
    const depositEvent = await this.depositRepository.findOne({
      where: { id: relayHashInfo.depositEventId },
    });
    const swapEvent = await this.swapBeforeBridgeRepository.findOne({
      where: { id: swapEventId },
    });

    if (!swapEvent) {
      this.logger.warn({
        at: "SwapWorker",
        message: `Swap event not found for id ${swapEventId}`,
      });
      return;
    }
    // a swap event should always have a deposit event
    if (!depositEvent) {
      this.logger.warn({
        at: "SwapWorker",
        message: `Deposit event not found for id ${relayHashInfo.depositEventId}`,
      });
      return;
    }
    // a deposit event should always have a block timestamp
    if (!depositEvent.blockTimestamp) {
      this.logger.warn({
        at: "SwapWorker",
        message: `Deposit event block timestamp not found for id ${relayHashInfo.depositEventId}`,
      });
      return;
    }

    const { acrossInputToken, acrossInputAmount, swapToken, swapTokenAmount } =
      swapEvent;
    const swapTokenPrice = await this.getPrice(
      swapToken,
      swapEvent.chainId,
      depositEvent.blockTimestamp,
    );
    const acrossInputTokenPrice = await this.getPrice(
      acrossInputToken,
      swapEvent.chainId,
      depositEvent.blockTimestamp,
    );
    if (!swapTokenPrice || !acrossInputTokenPrice) {
      this.logger.warn({
        at: "SwapWorker",
        message: `Unable to get price for swap token`,
        swapEvent,
        swapTokenPrice,
        acrossInputTokenPrice,
      });
      return;
    }
    // converting wei to normal float value before doing any more math
    const swapTokenAmountUsd =
      Number(
        ethers.utils.formatUnits(
          swapTokenAmount,
          swapTokenPrice.tokenInfo.decimals,
        ),
      ) * swapTokenPrice.price;
    const acrossInputAmountUsd =
      Number(
        ethers.utils.formatUnits(
          acrossInputAmount,
          acrossInputTokenPrice.tokenInfo.decimals,
        ),
      ) * acrossInputTokenPrice.price;
    const swapFeeUsd = swapTokenAmountUsd - acrossInputAmountUsd;
    await this.relayHashInfoRepository.update(
      // this is swapBeforeBridge entity id, unique to database
      { swapBeforeBridgeEventId: swapEventId },
      {
        swapTokenPriceUsd: swapTokenPrice.price.toString(),
        swapFeeUsd: swapFeeUsd.toString(),
      },
    );
  }

  public async close() {
    return this.worker.close();
  }
}
