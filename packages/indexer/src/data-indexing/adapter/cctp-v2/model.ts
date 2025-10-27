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

export interface SponsoredDepositForBurnEvent extends ethers.Event {
  args: [] & {
    nonce: string;
    depositor: string;
    finalRecipient: string;
    deadline: BigNumber;
    maxBpsToSponsor: BigNumber;
    maxUserSlippageBps: BigNumber;
    finalToken: string;
    signature: string;
  };
}

// ============================================================================
// SVM Event Types
// ============================================================================

export interface SolanaDepositForBurnEvent {
  name: string;
  slot: bigint;
  signature: Signature;
  program: Address;
  blockTime: UnixTimestamp | null;
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

export interface SolanaMessageSentEvent {
  slot: bigint;
  signature: Signature;
  blockTime: UnixTimestamp | null;
  message: string;
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

export interface SolanaMessageReceivedEvent {
  slot: bigint;
  signature: Signature;
  blockTime: UnixTimestamp | null;
  caller: string;
  sourceDomain: number;
  nonce: string;
  sender: string;
  finalityThresholdExecuted: number;
  messageBody: string;
}

export interface SolanaMintAndWithdrawEvent {
  slot: bigint;
  signature: Signature;
  blockTime: UnixTimestamp | null;
  mintRecipient: string;
  amount: string;
  mintToken: string;
  feeCollected: string;
}

// ============================================================================
// Chain-Agnostic CCTP Event Types (works for both EVM and SVM)
// ============================================================================

export interface DepositForBurnWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  // Event data
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
}

export interface MessageSentWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  message: string;
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

export interface MessageReceivedWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  caller: string;
  sourceDomain: number;
  nonce: string;
  sender: string;
  finalityThresholdExecuted: number;
  messageBody: string;
}

export interface MintAndWithdrawWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  mintRecipient: string;
  amount: string;
  mintToken: string;
  feeCollected: string;
}

export interface SponsoredDepositForBurnWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  // Event data
  nonce: string;
  depositor: string;
  finalRecipient: string;
  deadline: string;
  maxBpsToSponsor: string;
  maxUserSlippageBps: string;
  finalToken: string;
  signature: string;
}

export interface ArbitraryActionsExecutedEvent extends ethers.Event {
  args: [] & {
    quoteNonce: string;
    initialToken: string;
    initialAmount: BigNumber;
    finalToken: string;
    finalAmount: BigNumber;
  };
}

export interface ArbitraryActionsExecutedWithBlock {
  // Transaction metadata
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;

  // Event data
  quoteNonce: string;
  initialToken: string;
  initialAmount: string;
  finalToken: string;
  finalAmount: string;
}
