import { ethers } from "ethers";
import { MulticallHandler__factory } from "@across-protocol/contracts";
import {
  SwapBeforeBridgeEvent,
  CallsFailedEvent,
  TerminalTransferEvent,
} from "./model/events";
import {
  BASE_SWAP_BEFORE_BRIDGE_ABI,
  SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI,
} from "./model/abis";

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

  static decodeTerminalTransferEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const transferEventTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ];

    const events: TerminalTransferEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      transferEventTopic,
      transferABI,
    );

    return events;
  }

  static decodeTransactionReceiptLogs(
    receipt: ethers.providers.TransactionReceipt,
    eventTopic: string,
    abi: any,
  ) {
    const events: (ethers.providers.Log & { args: any })[] = [];

    for (const log of receipt.logs) {
      const contractInterface = new ethers.utils.Interface(abi);

      if (log.topics.length === 0) continue;

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
