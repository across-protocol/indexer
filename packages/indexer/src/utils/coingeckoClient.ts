import * as s from "superstruct";
import { DateTime } from "luxon";

export const CoingeckoSymbol = s.enums([
  "ethereum",
  "matic-network",
  "wrapped-bitcoin",
  "usd-coin",
  "uma",
  "badger-dao",
  "weth",
  "boba-network",
  "dai",
  "balancer",
  "tether",
  "across-protocol",
  "havven",
  "pooltogether",
  "bridged-usd-coin-base",
  "optimism",
  "usd-coin-ethereum-bridged",
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
export type CGHistoricPriceBase = s.Infer<typeof CGHistoricPriceBase>;

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
