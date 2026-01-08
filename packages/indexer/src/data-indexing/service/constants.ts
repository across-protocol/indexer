import { CHAIN_IDs } from "@across-protocol/constants";
import { Config } from "../../parseEnv";

// taken from https://github.com/UMAprotocol/bot-configs/blob/ed878f5f80509ad4ca55c8200e40670ba50e3b26/serverless-bots/across-v2-bot-config.json#L330C1-L342C25
const finalisedBlockBufferDistances: Record<number, number> = {
  // Mainnets
  [CHAIN_IDs.ALEPH_ZERO]: 80,
  [CHAIN_IDs.ARBITRUM]: 240,
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: 240,
  [CHAIN_IDs.BASE]: 60,
  [CHAIN_IDs.BLAST]: 60,
  [CHAIN_IDs.BSC]: 60,
  [CHAIN_IDs.HYPEREVM]: 60,
  [CHAIN_IDs.HYPEREVM_TESTNET]: 60,
  [CHAIN_IDs.INK]: 60,
  [CHAIN_IDs.LENS]: 120,
  [CHAIN_IDs.LINEA]: 40,
  [CHAIN_IDs.LISK]: 120,
  [CHAIN_IDs.MAINNET]: 8,
  [CHAIN_IDs.MODE]: 120,
  [CHAIN_IDs.MONAD]: 120,
  [CHAIN_IDs.OPTIMISM]: 60,
  [CHAIN_IDs.PLASMA]: 60,
  [CHAIN_IDs.POLYGON]: 128,
  [CHAIN_IDs.REDSTONE]: 60,
  [CHAIN_IDs.SCROLL]: 40,
  [CHAIN_IDs.SOLANA]: 240,
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
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: 3,
  [CHAIN_IDs.BASE]: 4,
  [CHAIN_IDs.BLAST]: 4,
  [CHAIN_IDs.BSC]: 1,
  [CHAIN_IDs.HYPEREVM]: 4,
  [CHAIN_IDs.HYPEREVM_TESTNET]: 4,
  [CHAIN_IDs.INK]: 4,
  [CHAIN_IDs.LENS]: 10,
  [CHAIN_IDs.LISK]: 3,
  [CHAIN_IDs.LINEA]: 6,
  [CHAIN_IDs.MAINNET]: 10,
  [CHAIN_IDs.MODE]: 5,
  [CHAIN_IDs.MONAD]: 8,
  [CHAIN_IDs.OPTIMISM]: 4,
  [CHAIN_IDs.PLASMA]: 4,
  [CHAIN_IDs.POLYGON]: 3,
  [CHAIN_IDs.REDSTONE]: 4,
  [CHAIN_IDs.SCROLL]: 6,
  [CHAIN_IDs.SOLANA]: 2,
  [CHAIN_IDs.SONEIUM]: 4,
  [CHAIN_IDs.UNICHAIN]: 4,
  [CHAIN_IDs.WORLD_CHAIN]: 4,
  [CHAIN_IDs.ZK_SYNC]: 10,
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

/* ==================================================================================
 * CCTP DOMAIN LOGIC & CONFIGURATION
 * * Specific implementations for the Circle Cross-Chain Transfer Protocol (CCTP).
 * ================================================================================== */

// Taken from https://developers.circle.com/cctp/evm-smart-contracts
export const TOKEN_MESSENGER_ADDRESS_MAINNET: `0x${string}` =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
export const TOKEN_MESSENGER_ADDRESS_TESTNET: `0x${string}` =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

// Taken from https://developers.circle.com/cctp/evm-smart-contracts
export const MESSAGE_TRANSMITTER_ADDRESS_MAINNET: `0x${string}` =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
export const MESSAGE_TRANSMITTER_ADDRESS_TESTNET: `0x${string}` =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

// TODO: Update this address once the contract is deployed
export const SPONSORED_CCTP_DST_PERIPHERY_ADDRESS: {
  [key: number]: `0x${string}`;
} = {
  // Taken from https://hyperevmscan.io/address/0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95#code
  [CHAIN_IDs.HYPEREVM]: "0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95",
};

// TODO: Update this address once the contract is deployed
export const SPONSORED_CCTP_SRC_PERIPHERY_ADDRESS: {
  [key: number]: `0x${string}`;
} = {
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: "0x79176E2E91c77b57AC11c6fe2d2Ab2203D87AF85",
};

export const SWAP_API_CALLDATA_MARKER = "73c0de";
export const WHITELISTED_FINALIZERS = [
  "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
  "0x72adB07A487f38321b6665c02D289C413610B081",
  "0x49066b9c4a68e0942f77989e78d9e27f78a67ce7b165cafd101a477a148058fd",
  "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f", // CCTPHyperEVMSponsoredCCTPDstPeriphery
  "0x5616194d65638086a3191B1fEF436f503ff329eC",
];

export const DEPOSIT_FOR_BURN_EVENT_NAME = "DepositForBurn";
export const MESSAGE_SENT_EVENT_NAME = "MessageSent";
export const MESSAGE_RECEIVED_EVENT_NAME = "MessageReceived";
export const MINT_AND_WITHDRAW_EVENT_NAME = "MintAndWithdraw";

export const SWAP_FLOW_FINALIZED_EVENT_NAME = "SwapFlowFinalized";
export const SWAP_FLOW_INITIALIZED_EVENT_NAME = "SwapFlowInitialized";
export const SPONSORED_ACCOUNT_ACTIVATION_EVENT_NAME =
  "SponsoredAccountActivation";
export const SIMPLE_TRANSFER_FLOW_COMPLETED_EVENT_NAME =
  "SimpleTransferFlowCompleted";
export const FALLBACK_HYPER_EVM_FLOW_COMPLETED_EVENT_NAME =
  "FallbackHyperEVMFlowCompleted";
export const ARBITRARY_ACTIONS_EXECUTED_EVENT_NAME = "ArbitraryActionsExecuted";
export const SPONSORED_DEPOSIT_FOR_BURN_EVENT_NAME = "SponsoredDepositForBurn";
