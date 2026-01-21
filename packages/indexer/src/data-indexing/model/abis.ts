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

export const SPONSORED_OFT_SEND_ABI = [
  "event SponsoredOFTSend(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, bytes32 destinationHandler, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes sig)",
];
