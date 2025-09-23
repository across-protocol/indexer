import { CHAIN_IDs } from "@across-protocol/constants";
import { Config } from "../../parseEnv";

// taken from https://github.com/UMAprotocol/bot-configs/blob/ed878f5f80509ad4ca55c8200e40670ba50e3b26/serverless-bots/across-v2-bot-config.json#L330C1-L342C25
const finalisedBlockBufferDistances: Record<number, number> = {
  // Mainnets
  [CHAIN_IDs.ALEPH_ZERO]: 80,
  [CHAIN_IDs.ARBITRUM]: 240,
  [CHAIN_IDs.BASE]: 60,
  [CHAIN_IDs.BLAST]: 60,
  [CHAIN_IDs.BSC]: 60,
  [CHAIN_IDs.HYPEREVM]: 60,
  [CHAIN_IDs.INK]: 60,
  [CHAIN_IDs.LENS]: 120,
  [CHAIN_IDs.LINEA]: 40,
  [CHAIN_IDs.LISK]: 120,
  [CHAIN_IDs.MAINNET]: 8,
  [CHAIN_IDs.MODE]: 120,
  [CHAIN_IDs.OPTIMISM]: 60,
  [CHAIN_IDs.PLASMA]: 60,
  [CHAIN_IDs.POLYGON]: 128,
  [CHAIN_IDs.REDSTONE]: 60,
  [CHAIN_IDs.SCROLL]: 40,
  [CHAIN_IDs.SOLANA]: 40,
  [CHAIN_IDs.SONEIUM]: 60,
  [CHAIN_IDs.UNICHAIN]: 60,
  [CHAIN_IDs.WORLD_CHAIN]: 60,
  [CHAIN_IDs.ZK_SYNC]: 120,
  [CHAIN_IDs.ZORA]: 60,
  // BOBA is disabled
  [CHAIN_IDs.BOBA]: 0,
  // Testnets:
  [CHAIN_IDs.SOLANA_DEVNET]: 40,
};

export function getFinalisedBlockBufferDistance(chainId: number) {
  const buffer = finalisedBlockBufferDistances[chainId];

  if (!buffer) {
    throw new Error(
      `Finalised block buffer not defined for chainId: ${chainId}`,
    );
  }

  return buffer;
}

const indexingDelaySeconds: Record<number, number> = {
  // Mainnets
  [CHAIN_IDs.ALEPH_ZERO]: 2,
  [CHAIN_IDs.ARBITRUM]: 3,
  [CHAIN_IDs.BASE]: 4,
  [CHAIN_IDs.BLAST]: 4,
  [CHAIN_IDs.BSC]: 1,
  [CHAIN_IDs.HYPEREVM]: 4,
  [CHAIN_IDs.INK]: 4,
  [CHAIN_IDs.LENS]: 8,
  [CHAIN_IDs.LISK]: 3,
  [CHAIN_IDs.LINEA]: 6,
  [CHAIN_IDs.MAINNET]: 10,
  [CHAIN_IDs.MODE]: 3,
  [CHAIN_IDs.OPTIMISM]: 4,
  [CHAIN_IDs.PLASMA]: 4,
  [CHAIN_IDs.POLYGON]: 3,
  [CHAIN_IDs.REDSTONE]: 4,
  [CHAIN_IDs.SCROLL]: 6,
  [CHAIN_IDs.SOLANA]: 2,
  [CHAIN_IDs.SONEIUM]: 4,
  [CHAIN_IDs.UNICHAIN]: 4,
  [CHAIN_IDs.WORLD_CHAIN]: 4,
  [CHAIN_IDs.ZK_SYNC]: 8,
  [CHAIN_IDs.ZORA]: 4,
  // BOBA is disabled
  [CHAIN_IDs.BOBA]: 0,
  // Testnets:
  [CHAIN_IDs.SOLANA_DEVNET]: 2,
};

export function getIndexingDelaySeconds(chainId: number, config: Config) {
  // The value from ENV is used only to override the hardcoded value. It should not
  // be used as a fallback in case the hardcoded value is not defined.
  const indexingDelay =
    config.indexingDelaySeconds ?? indexingDelaySeconds[chainId];
  if (!indexingDelay) {
    throw new Error(`Indexing delay not defined for chainId: ${chainId}`);
  }

  return indexingDelay;
}
