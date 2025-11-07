import { BigNumber, providers } from "ethers";
import { createMapWithDefault } from "../../utils/map";
import { CHAIN_IDs } from "@across-protocol/constants";

export interface SimpleTransferFlowCompletedLog extends providers.Log {
  args: [] & {
    quoteNonce: string;
    finalRecipient: string;
    finalToken: string;
    evmAmountIn: BigNumber;
    bridgingFeesIncurred: BigNumber;
    evmAmountSponsored: BigNumber;
  };
}

// Taken from https://testnet.purrsec.com/tx/0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9
export const HYPERCORE_FLOW_EXECUTOR_ADDRESS: { [key: number]: string } = {
  [CHAIN_IDs.HYPEREVM_TESTNET]: "0x06C61D54958a0772Ee8aF41789466d39FfeaeB13",
};
