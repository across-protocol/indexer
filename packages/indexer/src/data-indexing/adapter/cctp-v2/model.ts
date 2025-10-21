import { BigNumber, ethers, providers } from "ethers";
import { Address, Signature, UnixTimestamp } from "@solana/kit";

// ============================================================================
// EVM Event Types
// ============================================================================

export interface DepositForBurnEvent extends ethers.Event {
  args: [] & {
    burnToken: string;
    amount: BigNumber;
    depositor: string;
    mintRecipient: string;
    destinationDomain: number;
    destinationTokenMessenger: string;
    destinationCaller: string;
    maxFee: BigNumber;
    minFinalityThreshold: number;
    hookData: string;
  };
}

export interface MessageSentLog extends providers.Log {
  args: [string] & {
    message: string;
  };
}

export interface MessageReceivedEvent extends ethers.Event {
  args: [] & {
    caller: string;
    sourceDomain: number;
    nonce: string;
    sender: string;
    finalityThresholdExecuted: number;
    messageBody: string;
  };
}

export interface MintAndWithdrawLog extends providers.Log {
  args: [] & {
    mintRecipient: string;
    amount: BigNumber;
    mintToken: string;
    feeCollected: BigNumber;
  };
}

// ============================================================================
// Chain-Agnostic CCTP Event Types (works for both EVM and SVM)
// ============================================================================

/**
 * Chain-agnostic DepositForBurn event
 * Can be created from either EVM or SVM events
 */
export interface DepositForBurnWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  // Event data
  burnToken: string;
  amount: string; // As string to handle BigInt
  depositor: string;
  mintRecipient: string; // bytes32 format
  destinationDomain: number;
  destinationTokenMessenger: string; // bytes32 format
  destinationCaller: string; // bytes32 format
  maxFee: string;
  minFinalityThreshold: number;
  hookData: string;
}

/**
 * Chain-agnostic MessageSent event
 * Can be created from either EVM or SVM events
 * Message is already decoded by the handler (EVM or SVM specific)
 */
export interface MessageSentWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  // Decoded message data (pre-decoded by handler)
  message: string; // Raw message hex (kept for compatibility)
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: string;
  sender: string;
  recipient: string;
  destinationCaller: string;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  messageBody: string;
}

// ============================================================================
// SVM Event Types (raw from SvmCpiEventsClient)
// ============================================================================

/**
 * Solana CCTP DepositForBurn event structure
 * Returned by SvmCpiEventsClient.queryEvents("DepositForBurn")
 */
export interface SolanaDepositForBurnEvent {
  name: string;
  slot: bigint;
  signature: Signature;
  program: Address;
  blockTime: UnixTimestamp | null; // Unix timestamp - already available!
  confirmationStatus: string | null;
  data: {
    nonce: string;
    burnToken: string;
    amount: string;
    depositor: string;
    mintRecipient: string;
    destinationDomain: number;
    destinationTokenMessenger: string;
    destinationCaller: string;
    maxFee: string;
    minFinalityThreshold: number;
    hookData: string;
  };
}
