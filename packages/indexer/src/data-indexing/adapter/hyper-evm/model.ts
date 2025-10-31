import { utils } from "ethers";

export type Block = {
  blockNumber: number;
  logIndex: number;
  transactionIndex: number;
  transactionHash: string;
};

export type SimpleTransferFlowCompleted = {
  quoteNonce: string;
  finalRecipient: string;
  finalToken: string;
  evmAmountIn: string;
  bridgingFeesIncurred: string;
  evmAmountSponsored: string;
};

export type SimpleTransferFlowCompletedWithBlock = SimpleTransferFlowCompleted &
  Block;

export type SwapFlowInitialized = {
  quoteNonce: string;
  finalRecipient: string;
  finalToken: string;
  evmAmountIn: string;
  bridgingFeesIncurred: string;
  coreAmountIn: string;
  minAmountToSend: string;
  maxAmountToSend: string;
};

export type SwapFlowInitializedWithBlock = SwapFlowInitialized & Block;

export const SimpleTransferFlowCompletedABI = new utils.Interface([
  `event SimpleTransferFlowCompleted(
    bytes32 indexed quoteNonce,
    address indexed finalRecipient,
    address indexed finalToken,
    uint256 evmAmountIn,
    uint256 bridgingFeesIncurred,
    uint256 evmAmountSponsored
  )`,
]);

export const SwapFlowInitializedABI = new utils.Interface([
  `event SwapFlowInitialized(
    bytes32 indexed quoteNonce,
    address indexed finalRecipient,
    address indexed finalToken,
    uint256 evmAmountIn,
    uint256 bridgingFeesIncurred,
    uint256 coreAmountIn,
    uint64 minAmountToSend,
    uint64 maxAmountToSend
  )`,
]);
