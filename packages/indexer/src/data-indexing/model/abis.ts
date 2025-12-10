/* ==================================================================================
 * CCTP DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the Circle Cross-Chain Transfer Protocol (CCTP).
 * ================================================================================== */
export const CCTP_DEPOSIT_FOR_BURN_ABI = [
  "event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)",
];

export const MESSAGE_SENT_ABI = ["event MessageSent(bytes message)"];

/* ==================================================================================
 * OFT DOMAIN LOGIC & CONFIGURATION
 * * Specific ABIs for the Omni-chain Fungible Token (OFT) protocol.
 * ================================================================================== */
export const OFT_SENT_ABI = [
  "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)",
];
