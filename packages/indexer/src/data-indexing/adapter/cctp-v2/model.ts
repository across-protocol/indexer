import { BigNumber, ethers, providers } from "ethers";

export interface DepositForBurnEvent extends ethers.Event {
  args: [] & {
    burnToken: string;
    amount: BigNumber;
    depositor: string;
    mintRecipient: string;
    destinationDomain: number;
    destinationTokenMessenger: string;
    destinationCaller: string;
    maxFee: BigNumber;
    minFinalityThreshold: number;
    hookData: string;
  };
}

export interface MessageSentLog extends providers.Log {
  args: [string] & {
    message: string;
  };
}

export interface MessageReceivedEvent extends ethers.Event {
  args: [] & {
    caller: string;
    sourceDomain: number;
    nonce: string;
    sender: string;
    finalityThresholdExecuted: number;
    messageBody: string;
  };
}

export interface MintAndWithdrawLog extends providers.Log {
  args: [] & {
    mintRecipient: string;
    amount: BigNumber;
    mintToken: string;
    feeCollected: BigNumber;
  };
}
