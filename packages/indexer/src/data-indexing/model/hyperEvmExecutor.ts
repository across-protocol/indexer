import { BigNumber, providers } from "ethers";
import { CHAIN_IDs } from "@across-protocol/constants";

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
