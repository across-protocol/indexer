import { ethers } from "ethers";
import { MulticallHandler__factory } from "@across-protocol/contracts";
import {
  SwapBeforeBridgeEvent,
  CallsFailedEvent,
  TransferEvent,
} from "./model/events";
import {
  BASE_SWAP_BEFORE_BRIDGE_ABI,
  SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI,
} from "./model/abis";
import {
  MessageSentLog,
  MintAndWithdrawLog,
  SponsoredDepositForBurnLog,
} from "../data-indexing/adapter/cctp-v2/model";
import { SponsoredOFTSendLog } from "../data-indexing/adapter/oft/model";

export class EventDecoder {
  static decodeSwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x646284e396b68ff4b4f34e0aa97bcdb9c100f5b44a20da5c475f627039853841";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      BASE_SWAP_BEFORE_BRIDGE_ABI,
    );

    return events;
  }

  static decodeSpokePoolPeripherySwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x32da500ab49223322bf87d13ba63ef4e5efd139c75f982183d27f59fc31fb250";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI,
    );

    return events;
  }

  static decodeCallsFailedEvents(receipt: ethers.providers.TransactionReceipt) {
    const callsFailedEventTopic =
      "0x5296f22c5d0413b66d0bf45c479c4e2ca5b278634bdbd028b48e49502105f966";
    const events: CallsFailedEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      callsFailedEventTopic,
      MulticallHandler__factory.abi,
    );

    return events;
  }

  static decodeTransferEvents(receipt: ethers.providers.TransactionReceipt) {
    const transferEventTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ];

    const events: TransferEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      transferEventTopic,
      transferABI,
      true,
    );

    return events;
  }

  /**
   * Decode CCTP MessageSent events and optionally specify the address of
   * the contract that emitted the event to avoid naming collisions.
   */
  static decodeCCTPMessageSentEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
    const eventAbi = ["event MessageSent (bytes message)"];
    let events: MessageSentLog[] = this.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeCCTPMintAndWithdrawEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63";
    const eventAbi = [
      "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)",
    ];
    let events: MintAndWithdrawLog[] = this.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeCCTPSponsoredDepositForBurnEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x42d1b5f3692944aee65b659fda3e120f817f17d8f2ac9a256f6fc5d642a591fe";
    // ABI fragment for the event
    const eventAbi = [
      "event SponsoredDepositForBurn(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes signature)",
    ];

    let events: SponsoredDepositForBurnLog[] =
      this.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeOFTSponsoredSendEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x8a3a662083991439c9f0749584c485572c61b8483a81953b4a6378afc25f180a";
    const eventAbi = [
      "event SponsoredOFTSend(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, bytes32 destinationHandler, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes sig)",
    ];

    let events: SponsoredOFTSendLog[] = this.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeTransactionReceiptLogs(
    receipt: ethers.providers.TransactionReceipt,
    eventTopic: string,
    abi: any,
    skipEmptyLogs: boolean = false,
  ) {
    const events: (ethers.providers.Log & { args: any })[] = [];

    for (const log of receipt.logs) {
      const contractInterface = new ethers.utils.Interface(abi);

      if (log.topics.length === 0 || (log.data === "0x" && skipEmptyLogs))
        continue;

      try {
        const parsedLog = contractInterface.parseLog(log);
        if (parsedLog && log.topics[0] === eventTopic) {
          events.push({ ...log, args: parsedLog.args });
        }
      } catch (e: any) {
        if (e.reason === "no matching event" && e.code === "INVALID_ARGUMENT") {
          continue;
        } else {
          throw e;
        }
      }
    }

    return events;
  }
}
