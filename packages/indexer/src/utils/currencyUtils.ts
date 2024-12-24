import * as constants from "@across-protocol/constants";
import { isCoingeckoSymbol, CoingeckoSymbol } from "./coingeckoClient";

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
  coingeckoId: CoingeckoSymbol;
};
// mapping the token constants to something easier to search
export const tokenSymbolsMap = [
  ...Object.values(constants.TOKEN_SYMBOLS_MAP),
] as TokenInfo[];
// map to just a flat list
export const tokensList = tokenSymbolsMap.reduce((result, token) => {
  Object.entries(token.addresses).forEach(([chainId, address]) => {
    if (!isCoingeckoSymbol(token.coingeckoId)) return result;
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
export function findTokenByAddress(
  address: string,
  chainId: number,
): Token | undefined {
  return tokensList.find(
    (token) =>
      token.address.toLowerCase() === address.toLowerCase() &&
      token.chainId === chainId,
  );
}
