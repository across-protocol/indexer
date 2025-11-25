import { IndexerEventPayload } from "../listening/genericEventListener";
import { UniTransfer } from "../data/entities";

/**
 * Transforms a raw event payload from the listener into a `UniTransfer` entity.
 *
 * This function acts as a mapping layer between the raw log data and the
 * structured format required by the database. It carefully extracts and formats
 * the arguments from the event.
 *
 * @param event The raw event payload received from the `genericEventListener` or
 *              the Reconciliation Service.
 * @returns A `UniTransfer` object ready to be inserted into the database.
 */
export const transformToUniTransferEntity = (
  event: IndexerEventPayload,
): UniTransfer => {
  return {
    chainId: event.chainId.toString(),
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    fromAddress: event.args.from,
    toAddress: event.args.to,
    amount: event.args.value?.toString() || "0",
    finalised: event.status === "finalized",
  };
};
