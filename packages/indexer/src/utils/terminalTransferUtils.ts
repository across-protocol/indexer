import { providers } from "ethers";
import { EventDecoder } from "../web3/EventDecoder";
import { entities } from "@repo/indexer-database";

export const TERMINAL_TRANSFER_ADDRESSES: Record<string, string> = {
  "0x200000000000000000000000000000000000010C": "1337", // HyperCore
};

export interface FillTerminalTransferPair {
  fill: entities.FilledV3Relay;
  terminalTransferChainId: string;
}

/**
 * Matches fill events with Transfer events to terminal transfer destinations
 * @param fills - Array of fill events
 * @param transactionReceipts - Map of transaction receipts
 * @returns Array of matched fill and transfer event pairs
 */
export function matchFillEventsWithTerminalTransfers(
  fills: entities.FilledV3Relay[],
  transactionReceipts: Record<string, providers.TransactionReceipt>,
): FillTerminalTransferPair[] {
  const fillsAndTransfersByTxHash = fills.reduce(
    (acc, fill) => {
      const receipt = transactionReceipts[fill.transactionHash.toLowerCase()];
      if (!receipt) return acc;

      const transferEvents = EventDecoder.decodeTerminalTransferEvents(receipt);

      // Find the first terminal transfer where amount equals fill amount
      const matchingTerminalTransfer = transferEvents.find((transfer) => {
        const isTerminalAddress = Object.keys(TERMINAL_TRANSFER_ADDRESSES).some(
          (terminalAddress) =>
            transfer.args.to.toLowerCase() === terminalAddress.toLowerCase(),
        );
        const amountMatches =
          transfer.args.value.toString() === fill.outputAmount;
        return isTerminalAddress && amountMatches;
      });

      if (matchingTerminalTransfer) {
        // Get the terminal chain ID
        const terminalAddress = Object.keys(TERMINAL_TRANSFER_ADDRESSES).find(
          (addr) =>
            addr.toLowerCase() ===
            matchingTerminalTransfer.args.to.toLowerCase(),
        );
        const terminalTransferChainId = terminalAddress
          ? TERMINAL_TRANSFER_ADDRESSES[terminalAddress]
          : null;

        if (terminalTransferChainId) {
          acc[fill.transactionHash] = {
            fills: fills.filter(
              (f) =>
                f.transactionHash.toLowerCase() ===
                fill.transactionHash.toLowerCase(),
            ),
            terminalTransferChainId,
          };
        }
      }
      return acc;
    },
    {} as Record<
      string,
      {
        fills: entities.FilledV3Relay[];
        terminalTransferChainId: string;
      }
    >,
  );

  // Match fills with their corresponding terminal transfer events
  const fillTerminalTransferPairs: FillTerminalTransferPair[] = [];

  Object.values(fillsAndTransfersByTxHash).forEach(
    ({ fills: txFills, terminalTransferChainId }) => {
      const sortedFills = txFills.sort((a, b) => a.logIndex - b.logIndex);

      sortedFills.forEach((fill) => {
        fillTerminalTransferPairs.push({
          fill,
          terminalTransferChainId,
        });
      });
    },
  );

  return fillTerminalTransferPairs;
}
