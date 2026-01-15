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

/* ==================================================================================
 * SPONSORED BRIDGING FLOW DOMAIN LOGIC & CONFIGURATION
 * * Specific event types for the Sponsored Bridging Flow.
 * ================================================================================== */

export interface SwapFlowFinalizedArgs {
  quoteNonce: `0x${string}`;
  finalRecipient: `0x${string}`;
  finalToken: `0x${string}`;
  totalSent: bigint;
  evmAmountSponsored: bigint;
}

export interface SwapFlowInitializedArgs {
  quoteNonce: `0x${string}`;
  finalRecipient: `0x${string}`;
  finalToken: `0x${string}`;
  evmAmountIn: bigint;
  bridgingFeesIncurred: bigint;
  coreAmountIn: bigint;
  minAmountToSend: bigint;
  maxAmountToSend: bigint;
}

export interface SponsoredDepositForBurnArgs {
  quoteNonce: `0x${string}`;
  originSender: `0x${string}`;
  finalRecipient: `0x${string}`;
  quoteDeadline: bigint;
  maxBpsToSponsor: bigint;
  maxUserSlippageBps: bigint;
  finalToken: `0x${string}`;
  signature: `0x${string}`;
  destinationChainId?: number;
}

export interface SponsoredAccountActivationArgs {
  quoteNonce: `0x${string}`;
  finalRecipient: `0x${string}`;
  fundingToken: `0x${string}`;
  evmAmountSponsored: bigint;
}

export interface SimpleTransferFlowCompletedArgs {
  quoteNonce: `0x${string}`;
  finalRecipient: `0x${string}`;
  finalToken: `0x${string}`;
  evmAmountIn: bigint;
  bridgingFeesIncurred: bigint;
  evmAmountSponsored: bigint;
}

export interface FallbackHyperEVMFlowCompletedArgs {
  quoteNonce: `0x${string}`;
  finalRecipient: `0x${string}`;
  finalToken: `0x${string}`;
  evmAmountIn: bigint;
  bridgingFeesIncurred: bigint;
  evmAmountSponsored: bigint;
}

export interface ArbitraryActionsExecutedArgs {
  quoteNonce: `0x${string}`;
  initialToken: `0x${string}`;
  initialAmount: bigint;
  finalToken: `0x${string}`;
  finalAmount: bigint;
}

/* ==================================================================================
 * OFT DOMAIN LOGIC & CONFIGURATION
 * * Specific event types for the Omnichain Fungible Token (OFT) Protocol.
 * ================================================================================== */

export interface OFTSentArgs {
  guid: `0x${string}`;
  dstEid: number;
  fromAddress: `0x${string}`;
  amountSentLD: bigint;
  amountReceivedLD: bigint;
}

export interface OFTReceivedArgs {
  guid: `0x${string}`;
  srcEid: number;
  toAddress: `0x${string}`;
  amountReceivedLD: bigint;
}

export type EventArgs =
  | DepositForBurnArgs
  | MessageSentArgs
  | MessageReceivedArgs
  | MintAndWithdrawArgs
  | SwapFlowFinalizedArgs
  | SwapFlowInitializedArgs
  | SponsoredDepositForBurnArgs
  | SponsoredAccountActivationArgs
  | SimpleTransferFlowCompletedArgs
  | FallbackHyperEVMFlowCompletedArgs
  | ArbitraryActionsExecutedArgs
  | OFTSentArgs
  | OFTReceivedArgs;