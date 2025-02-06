import Redis from "ioredis";
import winston from "winston";
import { DateTime } from "luxon";
import { Job, Worker } from "bullmq";
import * as across from "@across-protocol/sdk";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerQueues } from "./service";
import { ethers } from "ethers";
import { assert } from "@repo/error-handling";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import * as s from "superstruct";
import { findTokenByAddress, yesterday } from "../utils";

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
            message: `Error getting swap infor for hash ${data.swapEventId}`,
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
    const { swapEventId } = params;
    const swapEvent = await this.swapBeforeBridgeRepository.findOneBy({
      id: swapEventId,
    });

    if (!swapEvent) {
      this.logger.error({
        at: "SwapWorker",
        message: `Swap event not found for id ${swapEventId}`,
      });
      return;
    }

    const {
      acrossInputToken,
      acrossOutputToken,
      swapToken,
      swapTokenAmount,
      acrossInputAmount,
    } = swapEvent;
    const inputTokenInfo = findTokenByAddress(
      acrossInputToken,
      swapEvent.chainId,
    );
    const outputTokenInfo = findTokenByAddress(
      acrossOutputToken,
      swapEvent.chainId,
    );
    if (!inputTokenInfo || !outputTokenInfo) {
      return;
    }

    // this would be a lot easier if we had blockTimestamp in swapEvent
    const provider = this.retryProvidersFactory.getProviderForChainId(
      swapEvent.chainId,
    );
    const block = await provider.getBlock(swapEvent.blockHash);
    if (!block) {
      this.logger.error({
        at: "SwapWorker",
        message: `Block not found for hash ${swapEvent.blockHash}`,
      });
      return;
    }

    const blockTimestamp = new Date(block.timestamp * 1000);

    const inputPriceUsd = await this.getPrice(
      swapToken,
      swapEvent.chainId,
      blockTimestamp,
    );
    const outputPriceUsd = await this.getPrice(
      acrossInputToken,
      swapEvent.chainId,
      blockTimestamp,
    );
    if (!inputPriceUsd || !outputPriceUsd) {
      return;
    }
    const swapInputTokenName = inputTokenInfo.name;
    const swapOutputTokenName = outputTokenInfo.name;
    // converting wei to normal float value before doing any more math
    const swapInputAmountUsd =
      Number(
        ethers.utils.formatUnits(swapTokenAmount, inputTokenInfo.decimals),
      ) * inputPriceUsd;
    const swapOutputAmountUsd =
      Number(
        ethers.utils.formatUnits(acrossInputAmount, outputTokenInfo.decimals),
      ) * outputPriceUsd;
    const swapFeeUsdAmount = swapInputAmountUsd - swapOutputAmountUsd;
    // this calculation is very innaccurate but gives us a ballpark of input tokens lost during swap
    const swapFeeInputAmount = swapFeeUsdAmount / inputPriceUsd;
    this.relayHashInfoRepository.update(
      // this is deposit entity id, unique to database
      { swapBeforeBridgeEventId: swapEventId },
      {
        swapInputTokenName,
        swapOutputTokenName,
        swapFeeInputAmount: swapFeeInputAmount.toString(),
        swapFeeUsdAmount: swapFeeUsdAmount.toString(),
      },
    ),
      this.logger.info({
        at: "SwapWorker",
        message: "Updated relay hashinfo with swap data",
        swapEventId,
      });
  }
  public async close() {
    return this.worker.close();
  }
}
