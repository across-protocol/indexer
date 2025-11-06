import { BigNumber, ethers, providers } from "ethers";
import { Address, Signature, UnixTimestamp } from "@solana/kit";
import { Log } from "../../model";

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

export interface DepositForBurn {
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

export type DepositForBurnWithBlock = DepositForBurn & Log;

export interface MessageSent {
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

export type MessageSentWithBlock = MessageSent & Log;

export interface MessageReceived {
  caller: string;
  sourceDomain: number;
  nonce: string;
  sender: string;
  finalityThresholdExecuted: number;
  messageBody: string;
}

export type MessageReceivedWithBlock = MessageReceived & Log;

export interface MintAndWithdraw {
  mintRecipient: string;
  amount: string;
  mintToken: string;
  feeCollected: string;
}

export type MintAndWithdrawWithBlock = MintAndWithdraw & Log;

export interface SponsoredDepositForBurn {
  nonce: string;
  originSender: string;
  finalRecipient: string;
  quoteDeadline: Date;
  maxBpsToSponsor: string;
  maxUserSlippageBps: string;
  finalToken: string;
  signature: string;
}

export type SponsoredDepositForBurnWithBlock = SponsoredDepositForBurn & Log;
