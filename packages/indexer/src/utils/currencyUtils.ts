import * as constants from "@across-protocol/constants";
import { DateTime } from "luxon";
// Convert now to a consistent price timestamp yesterday for lookup purposes
export function yesterday(now: Date) {
  // theres a slight wrinkle when using coingecko, if the time falls within 12-3AM we must subtract 2 days, rather than 1
  const utcHour = DateTime.fromJSDate(now).toUTC().hour;
  const daysToSubtract = utcHour >= 0 && utcHour < 3 ? 2 : 1;
  return DateTime.fromJSDate(now).minus({ days: daysToSubtract }).toJSDate();
}

export type TokenInfo = {
  name: string;
  symbol: string;
  decimals: number;
  addresses: Record<number, string>;
  coingeckoId: string;
};
export type Token = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  chainId: number;
  coingeckoId: string;
};
// mapping the token constants to something easier to search
const tokenSymbolsMap = [
  ...Object.values(constants.TOKEN_SYMBOLS_MAP),
] as TokenInfo[];
// map to just a flat list
const tokensList = tokenSymbolsMap.reduce((result, token) => {
  Object.entries(token.addresses).forEach(([chainId, address]) => {
    result.push({
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      chainId: Number(chainId),
      address: address,
      coingeckoId: token.coingeckoId,
    });
  });
  return result;
}, [] as Token[]);

// given an address and chain id, return the token data
export function findTokenByAddress(address: string, chainId: number) {
  const result = tokensList.find(
    (token) =>
      token.address.toLowerCase() === address.toLowerCase() &&
      token.chainId === chainId,
  );

  return result;
}
