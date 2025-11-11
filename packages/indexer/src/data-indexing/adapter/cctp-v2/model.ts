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

export interface SponsoredDepositForBurnLog extends providers.Log {
  // Destination Chain Id is needed to be able to correctly format the finalRecipient address
  destinationChainId?: number;
  args: [] & {
    nonce: string;
    originSender: string;
    finalRecipient: string;
    quoteDeadline: BigNumber;
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
  originSender: string;
  finalRecipient: string;
  quoteDeadline: Date;
  maxBpsToSponsor: string;
  maxUserSlippageBps: string;
  finalToken: string;
  signature: string;
}

// ============================================================================
// HyperCore Withdrawal Hook Data Types
// ============================================================================

export interface DecodedHookData {
  /** The 20-byte address of the sender. */
  fromAddress: string;
  /** The 8-byte (uint64) HyperCore nonce. */
  hyperCoreNonce: BigNumber;
  /** The 4-byte (uint32) version ID of the hook data schema. */
  versionId: number;
  /** The 4-byte (uint32) declared length of the hook data fields (fromAddress + nonce + userData). */
  declaredLength: number;
  /** The 24-byte magic bytes, (e.g., "cctp-forward" or 0). */
  magicBytes: string;
  /** The dynamic user-provided hook data as a hex string. */
  userData: string;
}

export interface DecodedMessageBody {
  /** The 4-byte (uint32) version of the message schema. */
  version: number;
  /** The 32-byte token address being burned. */
  burnToken: string;
  /** The 32-byte address of the recipient on the destination chain. */
  mintRecipient: string;
  /** The 32-byte (uint256) amount of tokens to mint. */
  amount: BigNumber;
  /** The 32-byte address of the message sender. */
  messageSender: string;
  /** The 32-byte (uint256) maximum fee. */
  maxFee: BigNumber;
  /** The 32-byte (uint256) fee that was executed. */
  feeExecuted: BigNumber;
  /** The 32-byte (uint256) expiration block. */
  expirationBlock: BigNumber;
  /** The dynamic, ABI-encoded hook data as a hex string. */
  hookData: string;
}
