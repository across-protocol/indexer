import { providers } from "ethers";
import { TransactionReceipt, parseAbi } from "viem";
import { EventDecoder } from "../web3/EventDecoder";
import { entities } from "@repo/indexer-database";
import { decodeEventsFromReceipt } from "./eventMatching";
import { TRANSFER_ABI } from "../data-indexing/model/abis";
import { TransferArgs } from "../data-indexing/model/eventTypes";
import { Logger } from "winston";
import { TRANSFER_EVENT_NAME } from "../data-indexing/service";

export const TARGET_CHAIN_ACTION_ADDRESSES: Record<string, string> = {
  "0x200000000000000000000000000000000000010C": "1337", // HyperCore USDT0 System Address
  "0x2000000000000000000000000000000000000168": "1337", // HyperCore USDH System Address
};

export interface FillTargetChainActionPair {
  fill: entities.FilledV3Relay;
  actionsTargetChainId: string;
}

/**
 * Matches fill events with Transfer events to target chain action destinations
 * @param fills - Array of fill events
 * @param transactionReceipts - Map of transaction receipts (ethers)
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

  const fillsByTxHash = fills.reduce(
    (acc, fill) => {
      acc[fill.transactionHash.toLowerCase()] = [
        ...(acc[fill.transactionHash.toLowerCase()] || []),
        fill,
      ];
      return acc;
    },
    {} as Record<string, entities.FilledV3Relay[]>,
  );

  const transfersByTxHash = targetChainActionEvents.reduce(
    (acc, transfer) => {
      acc[transfer.transactionHash.toLowerCase()] = [
        ...(acc[transfer.transactionHash.toLowerCase()] || []),
        {
          to: transfer.args.to,
          value: transfer.args.value.toString(),
          logIndex: transfer.logIndex,
        },
      ];
      return acc;
    },
    {} as Record<string, { to: string; value: string; logIndex: number }[]>,
  );

  return Object.keys(fillsByTxHash)
    .map((txHash) => {
      const txFills = fillsByTxHash[txHash]!;
      const txTransfers = transfersByTxHash[txHash] || [];
      return matchFillsToTransfers(txFills, txTransfers);
    })
    .flat();
}

/**
 * Matches a single fill event with Transfer events to target chain action destinations
 * @param fill - The fill event
 * @param transactionReceipt - The viem transaction receipt
 * @returns The matched fill and target chain action pair or undefined
 */
export function matchFillEventWithTargetChainActions(
  fill: entities.FilledV3Relay,
  transactionReceipt: TransactionReceipt,
  logger: Logger,
): FillTargetChainActionPair | undefined {
  const targetChainActionEvents = decodeEventsFromReceipt<TransferArgs>({
    receipt: transactionReceipt,
    abi: parseAbi(TRANSFER_ABI),
    eventName: TRANSFER_EVENT_NAME,
  });

  const transfers = targetChainActionEvents.map((t) => ({
    to: t.event.to,
    value: t.event.value.toString(),
    logIndex: t.logIndex,
  }));

  const matches = matchFillsToTransfers([fill], transfers);
  if (matches.length > 1) {
    const message =
      "Multiple target chain action pairs found for fill event. Expected number of matches to be at maximum 1";
    logger.error({
      at: "matchFillEventWithTargetChainActions",
      message,
      fill,
      matches,
      transactionReceipt,
    });
    throw new Error(message);
  }
  return matches[0];
}

/**
 * Common logic to match fills with transfer events within a single transaction
 * @param fills - Array of fills in the transaction
 * @param transfers - Array of candidate transfer events in the transaction
 * @returns Array of matched fill and target chain action pairs
 */
function matchFillsToTransfers(
  fills: entities.FilledV3Relay[],
  transfers: { to: string; value: string; logIndex: number }[],
): FillTargetChainActionPair[] {
  const sortedFills = fills.sort((a, b) => a.logIndex - b.logIndex);
  const sortedTransfers = transfers.sort((a, b) => a.logIndex - b.logIndex);

  const matchedPairs: FillTargetChainActionPair[] = [];
  const usedTransferLogIndices = new Set<number>();

  sortedFills.forEach((fill) => {
    const matchingTransfer = sortedTransfers.find(
      (transfer) =>
        transfer.logIndex > fill.logIndex &&
        !usedTransferLogIndices.has(transfer.logIndex) &&
        transfer.value === fill.outputAmount &&
        Object.keys(TARGET_CHAIN_ACTION_ADDRESSES).some(
          (targetChainAddress) =>
            transfer.to.toLowerCase() === targetChainAddress.toLowerCase(),
        ),
    );

    if (matchingTransfer) {
      const targetChainAddress = Object.keys(
        TARGET_CHAIN_ACTION_ADDRESSES,
      ).find(
        (addr) => addr.toLowerCase() === matchingTransfer.to.toLowerCase(),
      );
      const actionsTargetChainId = targetChainAddress
        ? TARGET_CHAIN_ACTION_ADDRESSES[targetChainAddress]
        : null;

      if (actionsTargetChainId) {
        matchedPairs.push({ fill, actionsTargetChainId });
        usedTransferLogIndices.add(matchingTransfer.logIndex);
      }
    }
  });

  return matchedPairs;
}
