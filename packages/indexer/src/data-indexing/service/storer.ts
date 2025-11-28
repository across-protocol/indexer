import { entities } from "@repo/indexer-database";
import { BlockchainEventRepository } from "../../../../indexer-database/src/utils";
import { Storer } from "../model/eventProcessor";

const PK_CHAIN_BLOCK_TX_LOG = [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
];

/**
 * Stores a DepositForBurn event in the database.
 *
 * @param event The DepositForBurn entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeDepositForBurnEvent: Storer<
  Partial<entities.DepositForBurn>,
  BlockchainEventRepository
> = async (
  event: Partial<entities.DepositForBurn>,
  repository: BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
    entities.DepositForBurn,
    [event],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
    [],
  );
};
