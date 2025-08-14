import { ethers } from "ethers";
import { SwapBeforeBridgeEvent, CallsFailedEvent } from "./model/events";
import {
  SwapAndBridgeBase__factory,
  MulticallHandler__factory,
} from "@across-protocol/contracts";

export class EventDecoder {
  static decodeSwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x646284e396b68ff4b4f34e0aa97bcdb9c100f5b44a20da5c475f627039853841";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      SwapAndBridgeBase__factory.abi,
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
