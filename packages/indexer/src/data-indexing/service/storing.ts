import { entities } from "@repo/indexer-database";
import { utils as dbUtils, DataSourceType } from "@repo/indexer-database";
import { Storer } from "../model/genericTypes";

const PK_CHAIN_BLOCK_TX_LOG = [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
];
const UK_CHAIN_BLOCKHASH_LOG = ["chainId", "blockHash", "logIndex"];
const UK_INTERNAL_HASH = ["internalHash"];
const UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN = [
  "chainId",
  "rootBundleId",
  "leafId",
  "transactionHash",
];
const UPDATE_TRANSACTION_HASH = ["transactionHash"];
const UK_SPEED_UP_V3_DEPOSIT_ID_ORIGIN_CHAIN_TX_HASH_LOG_IDX = [
  "depositId",
  "originChainId",
  "transactionHash",
  "logIndex",
];

const UK_RELAYED_ROOT_BUNDLE = ["chainId", "rootBundleId", "transactionHash"];

/**
 * Stores a DepositForBurn event in the database.
 *
 * @param event The SponsoredDepositForBurn entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredDepositForBurnEvent: Storer<
  Partial<entities.SponsoredDepositForBurn>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.SponsoredDepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.SponsoredDepositForBurn>(
    entities.SponsoredDepositForBurn,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredDepositForBurn)[],
    [],
  );
};

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
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
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
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
    [],
  );
};

export const storeMessageReceivedEvent: Storer<
  Partial<entities.MessageReceived>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.MessageReceived>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.MessageReceived>(
    entities.MessageReceived,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageReceived)[],
    [],
  );
};

export const storeMintAndWithdrawEvent: Storer<
  Partial<entities.MintAndWithdraw>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.MintAndWithdraw>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.MintAndWithdraw>(
    entities.MintAndWithdraw,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MintAndWithdraw)[],
    [],
  );
};

/**
 * Stores a SwapFlowInitialized event in the database.
 *
 * @param event The SwapFlowInitialized entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSwapFlowInitializedEvent: Storer<
  Partial<entities.SwapFlowInitialized>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.SwapFlowInitialized>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.SwapFlowInitialized>(
    entities.SwapFlowInitialized,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowInitialized)[],
    [],
  );
};

/**
 * Stores a SwapFlowFinalized event in the database.
 *
 * @param event The SwapFlowFinalized entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSwapFlowFinalizedEvent: Storer<
  Partial<entities.SwapFlowFinalized>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.SwapFlowFinalized>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.SwapFlowFinalized>(
    entities.SwapFlowFinalized,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowFinalized)[],
    [],
  );
};

/**
 * Stores a SponsoredAccountActivation event in the database.
 *
 * @param event The SponsoredAccountActivation entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredAccountActivationEvent: Storer<
  Partial<entities.SponsoredAccountActivation>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.SponsoredAccountActivation>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.SponsoredAccountActivation>(
    entities.SponsoredAccountActivation,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredAccountActivation)[],
    [],
  );
};

/**
 * Stores a SimpleTransferFlowCompleted event in the database.
 *
 * @param event The SimpleTransferFlowCompleted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSimpleTransferFlowCompletedEvent: Storer<
  Partial<entities.SimpleTransferFlowCompleted>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.SimpleTransferFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
    entities.SimpleTransferFlowCompleted,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SimpleTransferFlowCompleted)[],
    [],
  );
};

/**
 * Stores a FallbackHyperEVMFlowCompleted event in the database.
 *
 * @param event The FallbackHyperEVMFlowCompleted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeFallbackHyperEVMFlowCompletedEvent: Storer<
  Partial<entities.FallbackHyperEVMFlowCompleted>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.FallbackHyperEVMFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.FallbackHyperEVMFlowCompleted>(
    entities.FallbackHyperEVMFlowCompleted,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.FallbackHyperEVMFlowCompleted)[],
    [],
  );
};

/**
 * Stores an ArbitraryActionsExecuted event in the database.
 *
 * @param event The ArbitraryActionsExecuted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeArbitraryActionsExecutedEvent: Storer<
  Partial<entities.ArbitraryActionsExecuted>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.ArbitraryActionsExecuted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.ArbitraryActionsExecuted>(
    entities.ArbitraryActionsExecuted,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ArbitraryActionsExecuted)[],
    [],
  );
};

/* ==================================================================================
 * OFT STORING LOGIC
 * ================================================================================== */

/**
 * Stores an OFTSent event in the database.
 *
 * @param event The OFTSent entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeOFTSentEvent: Storer<
  Partial<entities.OFTSent>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.OFTSent>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.OFTSent>(
    entities.OFTSent,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTSent)[],
    [],
  );
};

/**
 * Stores an OFTReceived event in the database.
 *
 * @param event The OFTReceived entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeOFTReceivedEvent: Storer<
  Partial<entities.OFTReceived>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.OFTReceived>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.OFTReceived>(
    entities.OFTReceived,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTReceived)[],
    [],
  );
};

/* ==================================================================================
 * SPOKE POOL STORING LOGIC
 * ================================================================================== */

export const storeFilledV3RelayEvent: Storer<
  Partial<entities.FilledV3Relay>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.FilledV3Relay>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.FilledV3Relay>(
    entities.FilledV3Relay,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_INTERNAL_HASH as (keyof entities.FilledV3Relay)[],
    UPDATE_TRANSACTION_HASH as (keyof entities.FilledV3Relay)[],
  );
};

export const storeV3FundsDepositedEvent: Storer<
  Partial<entities.V3FundsDeposited>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.V3FundsDeposited>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.V3FundsDeposited>(
    entities.V3FundsDeposited,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_INTERNAL_HASH as (keyof entities.V3FundsDeposited)[],
    [],
  );
};

/**
 * Stores an ExecutedRelayerRefundRoot event in the database.
 *
 * @param event The ExecutedRelayerRefundRoot entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeExecutedRelayerRefundRootEvent: Storer<
  Partial<entities.ExecutedRelayerRefundRoot>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.ExecutedRelayerRefundRoot>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.ExecutedRelayerRefundRoot>(
    entities.ExecutedRelayerRefundRoot,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN as (keyof entities.ExecutedRelayerRefundRoot)[],
    [],
  );
};

export const storeRequestedSpeedUpV3DepositEvent: Storer<
  Partial<entities.RequestedSpeedUpV3Deposit>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.RequestedSpeedUpV3Deposit>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.RequestedSpeedUpV3Deposit>(
    entities.RequestedSpeedUpV3Deposit,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_SPEED_UP_V3_DEPOSIT_ID_ORIGIN_CHAIN_TX_HASH_LOG_IDX as (keyof entities.RequestedSpeedUpV3Deposit)[], // Uses the unique constraint we checked earlier
    [],
  );
};

/**
 * Stores a RelayedRootBundle event in the database.
 *
 * @param event The RelayedRootBundle entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeRelayedRootBundleEvent: Storer<
  Partial<entities.RelayedRootBundle>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.RelayedRootBundle>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.RelayedRootBundle>(
    entities.RelayedRootBundle,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_RELAYED_ROOT_BUNDLE as (keyof entities.RelayedRootBundle)[],
    [],
  );
};

/**
 * Stores a RequestedSlowFill event in the database.
 *
 * @param event The RequestedV3SlowFill entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeRequestedSlowFillEvent: Storer<
  Partial<entities.RequestedV3SlowFill>,
  dbUtils.BlockchainEventRepository
> = async (
  event: Partial<entities.RequestedV3SlowFill>,
  repository: dbUtils.BlockchainEventRepository,
) => {
  return repository.saveAndHandleFinalisationBatch<entities.RequestedV3SlowFill>(
    entities.RequestedV3SlowFill,
    [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
    UK_INTERNAL_HASH as (keyof entities.RequestedV3SlowFill)[],
    [],
  );
};
