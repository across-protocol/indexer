import { entities } from "@repo/indexer-database";
import { utils as dbUtils } from "@repo/indexer-database";
import { Storer } from "../model/eventProcessor";

const PK_CHAIN_BLOCK_TX_LOG = [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
];

const PK_CHAIN_BLOCK_HASH_LOG = ["chainId", "blockHash", "logIndex"];

/**
 * Stores a DepositForBurn event in the database.
 *
 * @param event The DepositForBurn entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeDepositForBurnEvent: Storer<
  Partial<entities.DepositForBurn>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.DepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
    entities.DepositForBurn,
    [event],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
    [],
  );
};

export const storeMessageSentEvent: Storer<
  Partial<entities.MessageSent>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.MessageSent>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.MessageSent>(
    entities.MessageSent,
    [event],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
    [],
  );
};

export const storeOftSentEvent: Storer<
  Partial<entities.OFTSent>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.OFTSent>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.OFTSent>(
    entities.OFTSent,
    [event],
    PK_CHAIN_BLOCK_HASH_LOG as (keyof entities.OFTSent)[],
    [],
  );
};
