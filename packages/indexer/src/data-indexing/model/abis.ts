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
