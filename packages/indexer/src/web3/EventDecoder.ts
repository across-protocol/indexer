import { ethers } from "ethers";
import * as abi from "./abi";
import { SwapBeforeBridgeEvent } from "./model/events";

export class EventDecoder {
  static decodeSwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x646284e396b68ff4b4f34e0aa97bcdb9c100f5b44a20da5c475f627039853841";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      abi.SwapAndBridgeAbi,
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
