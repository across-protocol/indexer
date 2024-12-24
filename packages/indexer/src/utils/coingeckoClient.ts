import * as s from "superstruct";
import { DateTime } from "luxon";

// tken from scraper and adapted from https://github.com/across-protocol/constants/blob/master/src/tokens.ts
export const CoingeckoSymbol = s.enums([
  "across-protocol",
  "aleph-zero",
  "arbitrum",
  "badger-dao",
  "balancer",
  "boba-network",
  "bridged-usd-coin-base",
  "dai",
  "ethereum",
  "gho",
  "havven",
  "lisk",
  "matic-network",
  "optimism",
  "pooltogether",
  "tether",
  "uma",
  "usd-coin",
  "usd-coin-ethereum-bridged",
  "usdb",
  "weth",
  "wmatic",
  "wrapped-bitcoin",
]);
export type CoingeckoSymbol = s.Infer<typeof CoingeckoSymbol>;
export const CGHistoricPriceBase = s.object({
  id: s.string(),
  symbol: s.string(),
  name: s.string(),
  market_data: s.optional(
    s.object({
      current_price: s.record(s.string(), s.number()),
    }),
  ),
});
export const isCoingeckoSymbol = (symbol: string) =>
  s.is(symbol, CoingeckoSymbol);

export type CGHistoricPriceBase = s.Infer<typeof CGHistoricPriceBase>;

// Convert now to a consistent price timestamp yesterday for lookup purposes
export function yesterday(now: Date) {
  return DateTime.fromJSDate(now)
    .minus({ days: 1 })
    .set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
    .toJSDate();
}

export class CoingeckoClient {
  constructor(private baseUrl: string = "https://api.coingecko.com/api/v3") {}

  // rounds timestamp to the current day
  public async getHistoricDailyPrice(
    timestamp: number,
    symbol: CoingeckoSymbol,
  ): Promise<CGHistoricPriceBase> {
    const cgFormattedDate =
      DateTime.fromMillis(timestamp).toFormat("dd-LL-yyyy");
    const response = await fetch(
      `${this.baseUrl}/coins/${symbol}/history?date=${cgFormattedDate}&localization=false`,
    );
    if (!response.ok) {
      throw new Error(`Error fetching historic price: ${response.statusText}`);
    }
    return s.create(await response.json(), CGHistoricPriceBase);
  }
}
