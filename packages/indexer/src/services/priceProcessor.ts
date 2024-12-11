import { CoingeckoSymbol, CoingeckoClient } from "../utils/coingeckoClient";
import { Logger } from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { BaseIndexer } from "../generics";
import { DateTime } from "luxon";

type Config = {
  symbols: CoingeckoSymbol[];
  // not used currently
  quoteCurrency?: string;
};

type Deps = {
  logger: Logger;
  postgres: DataSource;
};

export class CoingeckoPriceProcessor extends BaseIndexer {
  private coingeckoClient: CoingeckoClient;
  constructor(
    private config: Config,
    private deps: Deps,
  ) {
    super(deps.logger, "CoingeckoPriceProcessor");
    this.coingeckoClient = new CoingeckoClient();
  }

  protected async indexerLogic(): Promise<void> {
    const now = Date.now();
    const dbFormattedDate = DateTime.fromMillis(now).toFormat("yyyy-LL-dd");
    const quoteCurrency = this.config.quoteCurrency ?? "usd";
    const historicPriceRepository = this.deps.postgres.getRepository(
      entities.HistoricPrice,
    );

    for (const symbol of this.config.symbols) {
      const existingPrice = await historicPriceRepository.findOne({
        where: {
          date: dbFormattedDate,
          baseCurrency: symbol,
          quoteCurrency,
        },
      });
      // do nothing, we have a price for this day
      if (existingPrice) return;

      try {
        const historicPriceData =
          await this.coingeckoClient.getHistoricDailyPrice(now, symbol);
        const price =
          historicPriceData.market_data?.current_price[quoteCurrency];
        // wasnt able to get a price
        if (price === undefined) {
          this.deps.logger.error(
            `Unable to find ${quoteCurrency} for ${symbol}`,
          );
          return;
        }
        await historicPriceRepository.insert({
          date: dbFormattedDate,
          baseCurrency: symbol,
          quoteCurrency,
          price: price.toString(),
        });
        this.logger.info({
          at: "CoingeckoPriceProcessor#indexerLogic",
          message: `Inserted historic price for ${symbol} on ${dbFormattedDate}`,
        });
      } catch (error) {
        this.logger.error({
          at: "CoingeckoPriceProcessor#indexerLogic",
          message: `Failed to fetch or insert historic price for ${symbol} on ${dbFormattedDate}`,
          error: (error as Error).message,
        });
      }
    }
  }

  protected async initialize(): Promise<void> {
    // Initialization logic if needed
  }
}
