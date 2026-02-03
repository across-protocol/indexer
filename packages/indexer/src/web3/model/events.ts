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
    exchangeCalldata?: string;
  };
}

export interface CallsFailedEvent extends providers.Log {
  args: {
    calls: [string, string, BigNumber][]; // [target, calldata, value]
    fallbackRecipient: string;
  };
}

export interface TransferEvent extends providers.Log {
  args: {
    from: string;
    to: string;
    value: BigNumber;
  };
}

export interface SwapMetadataEvent extends providers.Log {
  args: {
    data: string; // bytes data containing encoded swap metadata
  };
}

export interface UserAccountActivatedEvent extends providers.Log {
  args: {
    user: string;
    token: string;
    amountRequiredToActivate: BigNumber;
  };
}
