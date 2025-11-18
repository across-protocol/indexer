import { ethers, providers } from "ethers";
import { SimpleTransferFlowCompletedLog } from "../model";
import { EventDecoder } from "../../web3/EventDecoder";
import { entities, SaveQueryResult } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { BlockchainEventRepository } from "../../../../indexer-database/dist/src/utils";

/**
 * Decodes and extracts `SimpleTransferFlowCompleted` events from a collection of transaction receipts.
 * This function iterates over transaction receipts, decodes logs, and filters for `SimpleTransferFlowCompleted` events
 * emitted by a specified HyperEVM executor contract.
 *
 * @param transactionReceipts A record of transaction receipts, indexed by their transaction hash.
 * @param hyperEvmExecutorAddress The address of the HyperEVM executor contract to filter events from.
 * @returns An array of decoded `SimpleTransferFlowCompletedLog` objects.
 */
export function getSimpleTransferFlowCompletedEventsFromTransactionReceipts(
  transactionReceipts: Record<string, ethers.providers.TransactionReceipt>,
  hyperEvmExecutorAddress: string,
) {
  const events: SimpleTransferFlowCompletedLog[] = [];
  for (const txHash of Object.keys(transactionReceipts)) {
    const transactionReceipt = transactionReceipts[
      txHash
    ] as providers.TransactionReceipt;
    const simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[] =
      EventDecoder.decodeSimpleTransferFlowCompletedEvents(
        transactionReceipt,
        hyperEvmExecutorAddress,
      );
    if (simpleTransferFlowCompletedEvents.length > 0) {
      events.push(...simpleTransferFlowCompletedEvents);
    }
  }

  return events;
}

/**
 * Formats and saves `SimpleTransferFlowCompleted` events to the database.
 * This function maps the raw event data to the database entity format, marks them as finalized if they are within the finalized block range,
 * and then saves them to the database in batches.
 *
 * @param repository The repository for database operations, specifically for saving blockchain events.
 * @param simpleTransferFlowCompletedEvents An array of `SimpleTransferFlowCompletedLog` events to be processed.
 * @param lastFinalisedBlock The last block number that is considered finalized.
 * @param chainId The ID of the chain where these events were emitted.
 * @param blockDates A record mapping block numbers to their corresponding `Date` objects.
 * @param chunkSize The number of events to save in a single batch. Defaults to 100.
 * @returns A promise that resolves to an array of `SaveQueryResult` for the saved events.
 */
export async function formatAndSaveSimpleTransferFlowCompletedEvents(
  repository: BlockchainEventRepository,
  simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[],
  lastFinalisedBlock: number,
  chainId: number,
  blockDates: Record<number, Date>,
  chunkSize = 100,
) {
  const formattedEvents: Partial<entities.SimpleTransferFlowCompleted>[] =
    simpleTransferFlowCompletedEvents.map((event) => {
      return {
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
        transactionHash: event.transactionHash,
        transactionIndex: event.transactionIndex,
        blockTimestamp: blockDates[event.blockNumber]!,
        chainId: chainId.toString(),
        quoteNonce: event.args.quoteNonce,
        finalRecipient: event.args.finalRecipient,
        finalToken: event.args.finalToken.toString(),
        evmAmountIn: event.args.evmAmountIn.toString(),
        bridgingFeesIncurred: event.args.bridgingFeesIncurred.toString(),
        evmAmountSponsored: event.args.evmAmountSponsored.toString(),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });

  const chunkedEvents = across.utils.chunk(formattedEvents, chunkSize);
  const savedEvents = await Promise.all(
    chunkedEvents.map((eventsChunk) =>
      repository.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
        entities.SimpleTransferFlowCompleted,
        eventsChunk,
        ["chainId", "blockNumber", "transactionHash", "logIndex"],
        [],
      ),
    ),
  );
  const result = savedEvents.flat();
  return result;
}
