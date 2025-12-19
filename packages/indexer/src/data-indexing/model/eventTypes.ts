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

export interface MessageReceivedArgs {
  caller: `0x${string}`;
  sourceDomain: number;
  nonce: `0x${string}`;
  sender: `0x${string}`;
  finalityThresholdExecuted: number;
  messageBody: `0x${string}`;
}

export interface MintAndWithdrawArgs {
  mintRecipient: `0x${string}`;
  amount: bigint;
  mintToken: `0x${string}`;
  feeCollected: bigint;
}

export type EventArgs =
  | DepositForBurnArgs
  | MessageSentArgs
  | MessageReceivedArgs
  | MintAndWithdrawArgs;
