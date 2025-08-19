import { BigNumber, providers } from "ethers";

export interface SwapBeforeBridgeEvent extends providers.Log {
  args: {
    swapToken: string;
    acrossInputToken: string;
    acrossOutputToken: string;
    swapTokenAmount: BigNumber;
    acrossInputAmount: BigNumber;
    acrossOutputAmount: BigNumber;
    exchange: string;
  };
}

export interface CallsFailedEvent extends providers.Log {
  args: {
    calls: [string, string, BigNumber][]; // [target, calldata, value]
    fallbackRecipient: string;
  };
}
