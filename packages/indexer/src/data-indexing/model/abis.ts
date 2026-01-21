/* ==================================================================================
 * CCTP DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the Circle Cross-Chain Transfer Protocol (CCTP).
 * ================================================================================== */
export const CCTP_DEPOSIT_FOR_BURN_ABI = [
  "event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)",
];

export const CCTP_MESSAGE_SENT_ABI = ["event MessageSent(bytes message)"];

export const CCTP_MESSAGE_RECEIVED_ABI = [
  "event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)",
];

export const CCTP_MINT_AND_WITHDRAW_ABI = [
  "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)",
];

/* ==================================================================================
 * SPONSORED BRIDGING FLOW DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the Sponsored Bridging Flow.
 * ================================================================================== */
export const SWAP_FLOW_FINALIZED_ABI = [
  "event SwapFlowFinalized(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint64 totalSent,uint256 evmAmountSponsored)",
];

export const SWAP_FLOW_INITIALIZED_ABI = [
  "event SwapFlowInitialized(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint256 evmAmountIn,uint256 bridgingFeesIncurred,uint256 coreAmountIn,uint64 minAmountToSend,uint64 maxAmountToSend)",
];

export const SPONSORED_DEPOSIT_FOR_BURN_ABI = [
  "event SponsoredDepositForBurn(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes signature)",
];

export const SPONSORED_ACCOUNT_ACTIVATION_ABI = [
  "event SponsoredAccountActivation(bytes32 indexed quoteNonce, address indexed finalRecipient, address indexed fundingToken, uint256 evmAmountSponsored)",
];

export const SIMPLE_TRANSFER_FLOW_COMPLETED_ABI = [
  "event SimpleTransferFlowCompleted(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint256 evmAmountIn,uint256 bridgingFeesIncurred,uint256 evmAmountSponsored)",
];

export const FALLBACK_HYPER_EVM_FLOW_COMPLETED_ABI = [
  "event FallbackHyperEVMFlowCompleted(bytes32 indexed quoteNonce, address indexed finalRecipient, address indexed finalToken, uint256 evmAmountIn, uint256 bridgingFeesIncurred, uint256 evmAmountSponsored)",
];

export const ARBITRARY_ACTIONS_EXECUTED_ABI = [
  "event ArbitraryActionsExecuted(bytes32 indexed quoteNonce, address indexed initialToken, uint256 initialAmount, address indexed finalToken, uint256 finalAmount)",
];

/* ==================================================================================
 * OFT DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the Omnichain Fungible Token (OFT) Protocol.
 * ================================================================================== */
export const OFT_SENT_ABI = [
  "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)",
];

export const OFT_RECEIVED_ABI = [
  "event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)",
];

/* ==================================================================================
 * FILLED V3 RELAY DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the FILLED V3 RELAY Protocol.
 * ================================================================================== */
export const FILLED_RELAY_V3_ABI = [
  "event FilledRelay(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 exclusiveRelayer, bytes32 indexed relayer, bytes32 depositor, bytes32 recipient, bytes32 messageHash, (bytes32 updatedRecipient, bytes32 updatedMessageHash, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)",
];

export const FUNDS_DEPOSITED_V3_ABI = [
  "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)",
];

export const EXECUTED_RELAYER_REFUND_ROOT_ABI = [
  "event ExecutedRelayerRefundRoot(uint256 amountToReturn, uint256 indexed chainId, uint256[] refundAmounts, uint32 indexed rootBundleId, uint32 indexed leafId, address l2TokenAddress, address[] refundAddresses, bool deferredRefunds, address caller)",
];

export const REQUESTED_SPEED_UP_V3_DEPOSIT_ABI = [
  "event RequestedSpeedUpV3Deposit(uint256 updatedOutputAmount, uint32 indexed depositId, address indexed depositor, address updatedRecipient, bytes updatedMessage, bytes depositorSignature)",
];

export const RELAYED_ROOT_BUNDLE_ABI = [
  "event RelayedRootBundle(uint32 indexed rootBundleId, bytes32 indexed relayerRefundRoot, bytes32 indexed slowRelayRoot)",
];
