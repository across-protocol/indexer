import { BigNumber, providers } from "ethers";

export const SPONSORED_ACCOUNT_ACTIVATION_ABI = [
  "event SponsoredAccountActivation(bytes32 indexed quoteNonce, address indexed finalRecipient, address indexed fundingToken, uint256 evmAmountSponsored)",
];

export const SWAP_FLOW_FINALIZED_ABI = [
  "event SwapFlowFinalized(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint64 totalSent,uint256 evmAmountSponsored)",
];

export interface SponsoredAccountActivationLog extends providers.Log {
  args: {
    quoteNonce: string;
    finalRecipient: string;
    fundingToken: string;
    evmAmountSponsored: BigNumber;
  };
}

export interface SimpleTransferFlowCompletedLog extends providers.Log {
  args: {
    quoteNonce: string;
    finalRecipient: string;
    finalToken: string;
    evmAmountIn: BigNumber;
    bridgingFeesIncurred: BigNumber;
    evmAmountSponsored: BigNumber;
  };
}

export interface ArbitraryActionsExecutedLog extends providers.Log {
  args: {
    quoteNonce: string;
    initialToken: string;
    initialAmount: BigNumber;
    finalToken: string;
    finalAmount: BigNumber;
  };
}

export interface FallbackHyperEVMFlowCompletedLog extends providers.Log {
  args: {
    quoteNonce: string;
    finalRecipient: string;
    finalToken: string;
    evmAmountIn: BigNumber;
    bridgingFeesIncurred: BigNumber;
    evmAmountSponsored: BigNumber;
  };
}

export interface SwapFlowInitializedLog extends providers.Log {
  args: {
    quoteNonce: string;
    finalRecipient: string;
    finalToken: string;
    evmAmountIn: BigNumber;
    bridgingFeesIncurred: BigNumber;
    coreAmountIn: BigNumber;
    minAmountToSend: BigNumber;
    maxAmountToSend: BigNumber;
  };
}

export interface SwapFlowFinalizedLog extends providers.Log {
  args: {
    quoteNonce: string;
    finalRecipient: string;
    finalToken: string;
    totalSent: BigNumber;
    evmAmountSponsored: BigNumber;
  };
}
