import * as s from "superstruct";
import { DateTime } from "luxon";

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
    symbol: string,
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
