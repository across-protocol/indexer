/* ==================================================================================
 * CCTP DOMAIN LOGIC & CONFIGURATION
 * * Specific event types for the Circle Cross-Chain Transfer Protocol (CCTP).
 * ================================================================================== */

// Define the expected args structure for a DepositForBurn event from Viem.
export interface DepositForBurnArgs {
  burnToken: `0x${string}`;
  amount: bigint;
  depositor: `0x${string}`;
  mintRecipient: `0x${string}`;
  destinationDomain: number;
  destinationTokenMessenger: `0x${string}`;
  destinationCaller: `0x${string}`;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: `0x${string}`;
}

export interface MessageSentArgs {
  message: `0x${string}`;
}
/* ==================================================================================
 * OFT DOMAIN LOGIC & CONFIGURATION
 * * Specific event types for the Omni-chain Fungible Token (OFT) protocol.
 * ================================================================================== */
export interface OftSentArgs {
  guid: `0x${string}`;
  fromAddress: `0x${string}`;
  dstEid: number;
  amountSentLD: number;
  amountReceivedLD: number;
}
