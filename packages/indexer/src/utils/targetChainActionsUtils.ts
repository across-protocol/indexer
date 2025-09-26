import { providers } from "ethers";
import { EventDecoder } from "../web3/EventDecoder";
import { entities } from "@repo/indexer-database";

export const TARGET_CHAIN_ACTION_ADDRESSES: Record<string, string> = {
  "0x200000000000000000000000000000000000010C": "1337", // HyperCore
};

export interface FillTargetChainActionPair {
  fill: entities.FilledV3Relay;
  actionsTargetChainId: string;
}

/**
 * Matches fill events with Transfer events to target chain action destinations
 * @param fills - Array of fill events
 * @param transactionReceipts - Map of transaction receipts
 * @returns Array of matched fill and target chain action pairs
 */
export function matchFillEventsWithTargetChainActions(
  fills: entities.FilledV3Relay[],
  transactionReceipts: Record<string, providers.TransactionReceipt>,
): FillTargetChainActionPair[] {
  const transactionReceiptsList = Object.values(transactionReceipts);
  const targetChainActionEvents = transactionReceiptsList
    .map((transactionReceipt) =>
      EventDecoder.decodeTransferEvents(transactionReceipt),
    )
    .flat();

  const fillsAndTargetChainActionsByTxHash = targetChainActionEvents.reduce(
    (acc, targetChainAction) => {
      acc[targetChainAction.transactionHash] = {
        fills: fills.filter(
          (f) =>
            f.transactionHash.toLowerCase() ===
            targetChainAction.transactionHash.toLowerCase(),
        ),
        targetChainActions: targetChainActionEvents.filter(
          (t) =>
            t.transactionHash.toLowerCase() ===
            targetChainAction.transactionHash.toLowerCase(),
        ),
      };
      return acc;
    },
    {} as Record<
      string,
      {
        fills: entities.FilledV3Relay[];
        targetChainActions: any[];
      }
    >,
  );

  // Match fills with their corresponding target chain action events
  const fillTargetChainActionPairs: FillTargetChainActionPair[] = Object.values(
    fillsAndTargetChainActionsByTxHash,
  )
    .map((fillAndTargetChainAction) => {
      const { fills: txFills, targetChainActions } = fillAndTargetChainAction;
      const sortedFills = txFills.sort((a, b) => a.logIndex - b.logIndex);
      const sortedTargetChainActions = targetChainActions.sort(
        (a, b) => a.logIndex - b.logIndex,
      );
      const matchedPairs: FillTargetChainActionPair[] = [];
      const usedTargetChainActions = new Set<number>(); // Track used target chain actions by their log index

      sortedFills.forEach((fill) => {
        const matchingTargetChainAction = sortedTargetChainActions.find(
          (targetChainAction) =>
            targetChainAction.logIndex > fill.logIndex &&
            !usedTargetChainActions.has(targetChainAction.logIndex) &&
            targetChainAction.args.value.toString() === fill.outputAmount &&
            Object.keys(TARGET_CHAIN_ACTION_ADDRESSES).some(
              (targetChainAddress) =>
                targetChainAction.args.to.toLowerCase() ===
                targetChainAddress.toLowerCase(),
            ),
        );
        if (matchingTargetChainAction) {
          // Get the target chain action chain ID
          const targetChainAddress = Object.keys(
            TARGET_CHAIN_ACTION_ADDRESSES,
          ).find(
            (addr) =>
              addr.toLowerCase() ===
              matchingTargetChainAction.args.to.toLowerCase(),
          );
          const actionsTargetChainId = targetChainAddress
            ? TARGET_CHAIN_ACTION_ADDRESSES[targetChainAddress]
            : null;

          if (actionsTargetChainId) {
            matchedPairs.push({ fill, actionsTargetChainId });
            usedTargetChainActions.add(matchingTargetChainAction.logIndex); // Mark this target chain action as used
          }
        }
      });

      return matchedPairs;
    })
    .flat();

  return fillTargetChainActionPairs;
}
