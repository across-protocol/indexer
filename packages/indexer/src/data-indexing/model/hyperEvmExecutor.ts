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

// Taken from https://testnet.purrsec.com/tx/0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9
export const HYPERCORE_FLOW_EXECUTOR_ADDRESS: { [key: number]: string } = {
  [CHAIN_IDs.HYPEREVM_TESTNET]: "0x06C61D54958a0772Ee8aF41789466d39FfeaeB13",
};

// Taken from https://hyperevmscan.io/tx/0x869d1df5f1e7b6b91a824d8e2b455ac48d1f26f0b5f2823c96df391eb75dff34#eventlog#8
export const ARBITRARY_EVM_FLOW_EXECUTOR_ADDRESS: { [key: number]: string } = {
  [CHAIN_IDs.HYPEREVM]: "0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95",
};
