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

export interface SponsoredOFTSendArgs {
  quoteNonce: `0x${string}`;
  originSender: `0x${string}`;
  finalRecipient: `0x${string}`;
  destinationHandler: `0x${string}`;
  quoteDeadline: bigint;
  maxBpsToSponsor: bigint;
  maxUserSlippageBps: bigint;
  finalToken: `0x${string}`;
  sig: `0x${string}`;
}

/* ==================================================================================
 * SPOKE POOL DOMAIN LOGIC & CONFIGURATION
 * * Specific event types for the Spoke Pool Protocol.
 * ================================================================================== */
export interface RelayExecutionInfo {
  updatedRecipient: `0x${string}`;
  updatedMessageHash: `0x${string}`;
  updatedOutputAmount: bigint;
  fillType: number;
}

export interface FilledV3RelayArgs {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  repaymentChainId: bigint;
  originChainId: bigint;
  depositId: number;
  fillDeadline: number;
  exclusivityDeadline: number;
  exclusiveRelayer: `0x${string}`;
  relayer: `0x${string}`;
  depositor: `0x${string}`;
  recipient: `0x${string}`;
  messageHash: `0x${string}`;
  relayExecutionInfo: RelayExecutionInfo;
}

export interface V3FundsDepositedArgs {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  destinationChainId: bigint;
  depositId: number;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusivityDeadline: number;
  depositor: `0x${string}`;
  recipient: `0x${string}`;
  exclusiveRelayer: `0x${string}`;
  message: `0x${string}`;
}

export interface ExecutedRelayerRefundRootArgs {
  amountToReturn: bigint;
  chainId: bigint;
  refundAmounts: bigint[];
  rootBundleId: number;
  leafId: number;
  l2TokenAddress: `0x${string}`;
  refundAddresses: `0x${string}`[];
  deferredRefunds: boolean;
  caller: `0x${string}`;
}

export interface RequestedSpeedUpV3DepositArgs {
  updatedOutputAmount: bigint;
  depositId: number;
  depositor: `0x${string}`;
  updatedRecipient: `0x${string}`;
  updatedMessage: `0x${string}`;
  depositorSignature: `0x${string}`;
}

export interface RelayedRootBundleArgs {
  rootBundleId: number;
  relayerRefundRoot: `0x${string}`;
  slowRelayRoot: `0x${string}`;
}

export interface RequestedSlowFillArgs {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  originChainId: bigint;
  depositId: bigint;
  fillDeadline: number;
  exclusivityDeadline: number;
  exclusiveRelayer: `0x${string}`;
  depositor: `0x${string}`;
  recipient: `0x${string}`;
  messageHash: `0x${string}`;
}

export interface TokensBridgedArgs {
  amountToReturn: bigint;
  chainId: bigint;
  leafId: number;
  l2TokenAddress: `0x${string}`;
  caller: `0x${string}`;
}

export interface ClaimedRelayerRefundArgs {
  l2TokenAddress: `0x${string}`;
  refundAddress: `0x${string}`;
  amount: bigint;
  caller: `0x${string}`;
}

export interface SwapBeforeBridgeArgs {
  exchange: `0x${string}`;
  swapToken: `0x${string}`;
  acrossInputToken: `0x${string}`;
  swapTokenAmount: bigint;
  acrossInputAmount: bigint;
  acrossOutputToken: `0x${string}`;
  acrossOutputAmount: bigint;
}

export interface CallsFailedArgs {
  calls: readonly {
    target: `0x${string}`;
    callData: `0x${string}`;
    value: bigint;
  }[];
  fallbackRecipient: `0x${string}`;
}

export interface SwapMetadataArgs {
  data: `0x${string}`;
}

export interface TransferArgs {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
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
  | OFTReceivedArgs
  | FilledV3RelayArgs
  | V3FundsDepositedArgs
  | SponsoredOFTSendArgs
  | ExecutedRelayerRefundRootArgs
  | RequestedSpeedUpV3DepositArgs
  | RelayedRootBundleArgs
  | RequestedSlowFillArgs
  | TokensBridgedArgs
  | ClaimedRelayerRefundArgs
  | ClaimedRelayerRefundArgs
  | SwapBeforeBridgeArgs
  | CallsFailedArgs
  | SwapMetadataArgs
  | TransferArgs;
