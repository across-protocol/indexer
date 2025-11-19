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

export interface SponsoredOFTSendLog extends ethers.providers.Log {
  args: [] & {
    quoteNonce: string;
    originSender: string;
    finalRecipient: string;
    destinationHandler: string;
    quoteDeadline: ethers.BigNumber;
    maxBpsToSponsor: ethers.BigNumber;
    maxUserSlippageBps: ethers.BigNumber;
    finalToken: string;
    sig: string;
  };
}

export interface ComposeDeliveredEvent extends ethers.Event {
  args: [] & {
    from: string;
    to: string;
    guid: string;
    index: number;
  };
}
