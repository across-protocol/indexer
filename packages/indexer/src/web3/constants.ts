import { CHAIN_IDs } from "@across-protocol/constants";

// This is the block distance at which the bot, by default, stores in redis with no TTL.
// These are all intended to be roughly 2 days of blocks for each chain.
// blocks = 172800 / avg_block_time
export const DEFAULT_NO_TTL_DISTANCE: { [chainId: number]: number } = {
  [CHAIN_IDs.ARBITRUM]: 691200,
  [CHAIN_IDs.BASE]: 86400,
  [CHAIN_IDs.BLAST]: 86400,
  [CHAIN_IDs.BOBA]: 86400,
  [CHAIN_IDs.LINEA]: 57600,
  [CHAIN_IDs.LISK]: 86400,
  [CHAIN_IDs.MAINNET]: 14400,
  [CHAIN_IDs.MODE]: 86400,
  [CHAIN_IDs.OPTIMISM]: 86400,
  [CHAIN_IDs.POLYGON]: 86400,
  [CHAIN_IDs.REDSTONE]: 86400,
  [CHAIN_IDs.SCROLL]: 57600,
  [CHAIN_IDs.ZK_SYNC]: 172800,
  [CHAIN_IDs.ZORA]: 86400,
};

// This is the max anticipated distance on each chain before RPC data is likely to be consistent amongst providers.
// This distance should consider re-orgs, but also the time needed for various RPC providers to agree on chain state.
// Provider caching will not be allowed for queries whose responses depend on blocks closer than this many blocks.
// This is intended to be conservative.
export const CHAIN_CACHE_FOLLOW_DISTANCE: { [chainId: number]: number } = {
  [CHAIN_IDs.ARBITRUM]: 32,
  [CHAIN_IDs.BASE]: 120,
  [CHAIN_IDs.BLAST]: 120,
  [CHAIN_IDs.BOBA]: 0,
  [CHAIN_IDs.LISK]: 120,
  [CHAIN_IDs.LINEA]: 100, // Linea has a soft-finality of 1 block. This value is padded - but at 3s/block the padding is 5 minutes
  [CHAIN_IDs.MAINNET]: 128,
  [CHAIN_IDs.MODE]: 120,
  [CHAIN_IDs.OPTIMISM]: 120,
  [CHAIN_IDs.POLYGON]: 256,
  [CHAIN_IDs.REDSTONE]: 120,
  [CHAIN_IDs.SCROLL]: 100,
  [CHAIN_IDs.ZK_SYNC]: 512,
  [CHAIN_IDs.ZORA]: 120,
  // Testnets:
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: 0,
  [CHAIN_IDs.BASE_SEPOLIA]: 0,
  [CHAIN_IDs.BLAST_SEPOLIA]: 0,
  [CHAIN_IDs.LISK_SEPOLIA]: 0,
  [CHAIN_IDs.MODE_SEPOLIA]: 0,
  [CHAIN_IDs.OPTIMISM_SEPOLIA]: 0,
  [CHAIN_IDs.POLYGON_AMOY]: 0,
  [CHAIN_IDs.SEPOLIA]: 0,
};

export const getChainCacheFollowDistance = (chainId: number) => {
  const chainCacheFollowDistance = CHAIN_CACHE_FOLLOW_DISTANCE[chainId];

  if (!chainCacheFollowDistance) {
    throw new Error(`Invalid chain cache distance for chain id ${chainId}`);
  }

  return chainCacheFollowDistance;
};

const MAX_BLOCK_LOOK_BACK = {
  [CHAIN_IDs.MAINNET]: 10000,
  [CHAIN_IDs.OPTIMISM]: 10000,
  [CHAIN_IDs.POLYGON]: 10000,
  [CHAIN_IDs.BOBA]: 4990,
  [CHAIN_IDs.ZK_SYNC]: 10000,
  [CHAIN_IDs.REDSTONE]: 10000,
  [CHAIN_IDs.LISK]: 10000,
  [CHAIN_IDs.BASE]: 10000,
  [CHAIN_IDs.MODE]: 10000,
  [CHAIN_IDs.ARBITRUM]: 10000,
  [CHAIN_IDs.LINEA]: 5000,
  [CHAIN_IDs.BLAST]: 10000,
  [CHAIN_IDs.SCROLL]: 3000,
  [CHAIN_IDs.ZORA]: 10000,
};

/**
 * Resolves the maxLookback for a given chain id
 * @param chainId Chain id to resolve max lookback for
 * @returns A max lookback from {@link MAX_BLOCK_LOOK_BACK} or a default of 10,000
 */
export function getMaxBlockLookBack(chainId: number) {
  const maxBlockLookBack = MAX_BLOCK_LOOK_BACK[chainId];

  if (!maxBlockLookBack) {
    return 10_000;
  }

  return maxBlockLookBack;
}
