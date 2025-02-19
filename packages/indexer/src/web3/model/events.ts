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
