import { BigNumber, ethers } from "ethers";

export interface OFTSentEvent extends ethers.Event {
  args: [] & {
    guid: string;
    dstEid: number;
    fromAddress: string;
    amountSentLD: BigNumber;
    amountReceivedLD: BigNumber;
  };
}

export interface OFTReceivedEvent extends ethers.Event {
  args: [] & {
    guid: string;
    srcEid: number;
    toAddress: string;
    amountReceivedLD: BigNumber;
  };
}
