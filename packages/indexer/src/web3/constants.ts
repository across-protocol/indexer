import { CHAIN_IDs } from "@across-protocol/constants";

// This is the block distance at which the bot, by default, stores in redis with no TTL.
// These are all intended to be roughly 2 days of blocks for each chain.
// blocks = 172800 / avg_block_time
const DEFAULT_NO_TTL_DISTANCE: { [chainId: number]: number } = {
  [CHAIN_IDs.ALEPH_ZERO]: 691200,
  [CHAIN_IDs.ARBITRUM]: 691200,
  [CHAIN_IDs.BASE]: 86400,
  [CHAIN_IDs.BLAST]: 86400,
  [CHAIN_IDs.BOBA]: 86400,
  [CHAIN_IDs.CHER]: 86400,
  [CHAIN_IDs.INK]: 86400,
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
  [CHAIN_IDs.WORLD_CHAIN]: 86400,
};

export function getNoTtlBlockDistance(chainId: number) {
  return 1_000_000_000_000;
  // const noTtlBlockDistance = DEFAULT_NO_TTL_DISTANCE[chainId];
  // if (!noTtlBlockDistance) {
  //   throw new Error(`No noTtlBlockDistance found for chainId: ${chainId}`);
  // }
  // return noTtlBlockDistance;
}

// This is the max anticipated distance on each chain before RPC data is likely to be consistent amongst providers.
// This distance should consider re-orgs, but also the time needed for various RPC providers to agree on chain state.
// Provider caching will not be allowed for queries whose responses depend on blocks closer than this many blocks.
// This is intended to be conservative.
export const CHAIN_CACHE_FOLLOW_DISTANCE: { [chainId: number]: number } = {
  [CHAIN_IDs.ALEPH_ZERO]: 32,
  [CHAIN_IDs.ARBITRUM]: 32,
  [CHAIN_IDs.BASE]: 120,
  [CHAIN_IDs.BLAST]: 120,
  [CHAIN_IDs.BOBA]: 0,
  [CHAIN_IDs.CHER]: 120,
  [CHAIN_IDs.INK]: 120,
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
  [CHAIN_IDs.WORLD_CHAIN]: 120,

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

  if (chainCacheFollowDistance === undefined) {
    throw new Error(`Invalid chain cache distance for chain id ${chainId}`);
  }

  return chainCacheFollowDistance;
};

// Default is 10K, add only needed overrides
const MAX_BLOCK_LOOK_BACK = {
  [CHAIN_IDs.BOBA]: 4990,
  [CHAIN_IDs.LINEA]: 5000,
  [CHAIN_IDs.MAINNET]: 5000,
  [CHAIN_IDs.REDSTONE]: 9000,
  [CHAIN_IDs.SCROLL]: 3000,
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

// Average block time in seconds by chain
export const BLOCK_TIME_SECONDS: { [chainId: number]: number } = {
  [CHAIN_IDs.ALEPH_ZERO]: 2,
  [CHAIN_IDs.ARBITRUM]: 0.25,
  [CHAIN_IDs.BASE]: 2,
  [CHAIN_IDs.BLAST]: 2,
  [CHAIN_IDs.BOBA]: 2,
  [CHAIN_IDs.CHER]: 2,
  [CHAIN_IDs.INK]: 1,
  [CHAIN_IDs.LINEA]: 3,
  [CHAIN_IDs.LISK]: 2,
  [CHAIN_IDs.MAINNET]: 12,
  [CHAIN_IDs.MODE]: 2,
  [CHAIN_IDs.OPTIMISM]: 2,
  [CHAIN_IDs.POLYGON]: 2,
  [CHAIN_IDs.REDSTONE]: 2,
  [CHAIN_IDs.SCROLL]: 3,
  [CHAIN_IDs.WORLD_CHAIN]: 2,
  [CHAIN_IDs.ZK_SYNC]: 1,
  [CHAIN_IDs.ZORA]: 2,
};

/**
 * Resolves the block time in seconds for a given chain id
 * @param chainId Chain id to resolve block time for
 * @returns The average block time in seconds from {@link BLOCK_TIME_SECONDS} or a default of 10
 */
export function getBlockTime(chainId: number) {
  const blockTime = BLOCK_TIME_SECONDS[chainId];

  if (!blockTime) {
    return 10;
  }

  return blockTime;
}
