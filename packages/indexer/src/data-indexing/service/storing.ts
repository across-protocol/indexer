import { entities, SaveQueryResult } from "@repo/indexer-database";
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
const UK_TOKENS_BRIDGED = [
  "chainId",
  "leafId",
  "l2TokenAddress",
  "transactionHash",
];

/**
 * Helper function to ensure exactly one item is stored and return it.
 * Throws an error if the result array doesn't contain exactly one item.
 * @param results The array of SaveQueryResult items
 * @param eventType The name of the event type for error messaging
 * @returns The single SaveQueryResult item
 */
function ensureSingleStoredItem<T>(
  results: SaveQueryResult<T>[],
  eventType: string,
): SaveQueryResult<T> {
  if (results.length === 0) {
    throw new Error(
      `Expected exactly one ${eventType} to be stored, but none were stored.`,
    );
  }
  if (results.length > 1) {
    throw new Error(
      `Expected exactly one ${eventType} to be stored, but ${results.length} were stored.`,
    );
  }
  return results[0]!;
}

/**
 * Stores a DepositForBurn event in the database.
 *
 * @param event The SponsoredDepositForBurn entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredDepositForBurnEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SponsoredDepositForBurn>,
  entities.SponsoredDepositForBurn
> = async (
  event: Partial<entities.SponsoredDepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SponsoredDepositForBurn> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SponsoredDepositForBurn>(
      entities.SponsoredDepositForBurn,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredDepositForBurn)[],
      [],
    );

  return ensureSingleStoredItem(result, "SponsoredDepositForBurn").data;
};

/**
 * Stores a DepositForBurn event in the database.
 *
 * @param event The DepositForBurn entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeDepositForBurnEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.DepositForBurn>,
  entities.DepositForBurn
> = async (
  event: Partial<entities.DepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.DepositForBurn> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
      entities.DepositForBurn,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
      [],
    );

  return ensureSingleStoredItem(result, "DepositForBurn").data;
};

export const storeMessageSentEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MessageSent>,
  entities.MessageSent
> = async (
  event: Partial<entities.MessageSent>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MessageSent> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.MessageSent>(
      entities.MessageSent,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
      [],
    );

  return ensureSingleStoredItem(result, "MessageSent").data;
};

export const storeMessageReceivedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MessageReceived>,
  entities.MessageReceived
> = async (
  event: Partial<entities.MessageReceived>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MessageReceived> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.MessageReceived>(
      entities.MessageReceived,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageReceived)[],
      [],
    );

  return ensureSingleStoredItem(result, "MessageReceived").data;
};

export const storeMintAndWithdrawEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MintAndWithdraw>,
  entities.MintAndWithdraw
> = async (
  event: Partial<entities.MintAndWithdraw>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MintAndWithdraw> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.MintAndWithdraw>(
      entities.MintAndWithdraw,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MintAndWithdraw)[],
      [],
    );

  return ensureSingleStoredItem(result, "MintAndWithdraw").data;
};

/**
 * Stores a SwapFlowInitialized event in the database.
 *
 * @param event The SwapFlowInitialized entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSwapFlowInitializedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SwapFlowInitialized>,
  entities.SwapFlowInitialized
> = async (
  event: Partial<entities.SwapFlowInitialized>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SwapFlowInitialized> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SwapFlowInitialized>(
      entities.SwapFlowInitialized,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowInitialized)[],
      [],
    );

  return ensureSingleStoredItem(result, "SwapFlowInitialized").data;
};

/**
 * Stores a SwapFlowFinalized event in the database.
 *
 * @param event The SwapFlowFinalized entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSwapFlowFinalizedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SwapFlowFinalized>,
  entities.SwapFlowFinalized
> = async (
  event: Partial<entities.SwapFlowFinalized>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SwapFlowFinalized> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SwapFlowFinalized>(
      entities.SwapFlowFinalized,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowFinalized)[],
      [],
    );

  return ensureSingleStoredItem(result, "SwapFlowFinalized").data;
};

/**
 * Stores a SponsoredAccountActivation event in the database.
 *
 * @param event The SponsoredAccountActivation entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredAccountActivationEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SponsoredAccountActivation>,
  entities.SponsoredAccountActivation
> = async (
  event: Partial<entities.SponsoredAccountActivation>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SponsoredAccountActivation> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SponsoredAccountActivation>(
      entities.SponsoredAccountActivation,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredAccountActivation)[],
      [],
    );

  return ensureSingleStoredItem(result, "SponsoredAccountActivation").data;
};

/**
 * Stores a SimpleTransferFlowCompleted event in the database.
 *
 * @param event The SimpleTransferFlowCompleted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSimpleTransferFlowCompletedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SimpleTransferFlowCompleted>,
  entities.SimpleTransferFlowCompleted
> = async (
  event: Partial<entities.SimpleTransferFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SimpleTransferFlowCompleted> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
      entities.SimpleTransferFlowCompleted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SimpleTransferFlowCompleted)[],
      [],
    );

  return ensureSingleStoredItem(result, "SimpleTransferFlowCompleted").data;
};

/**
 * Stores a FallbackHyperEVMFlowCompleted event in the database.
 *
 * @param event The FallbackHyperEVMFlowCompleted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeFallbackHyperEVMFlowCompletedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.FallbackHyperEVMFlowCompleted>,
  entities.FallbackHyperEVMFlowCompleted
> = async (
  event: Partial<entities.FallbackHyperEVMFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.FallbackHyperEVMFlowCompleted> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.FallbackHyperEVMFlowCompleted>(
      entities.FallbackHyperEVMFlowCompleted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.FallbackHyperEVMFlowCompleted)[],
      [],
    );

  return ensureSingleStoredItem(result, "FallbackHyperEVMFlowCompleted").data;
};

/**
 * Stores an ArbitraryActionsExecuted event in the database.
 *
 * @param event The ArbitraryActionsExecuted entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeArbitraryActionsExecutedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.ArbitraryActionsExecuted>,
  entities.ArbitraryActionsExecuted
> = async (
  event: Partial<entities.ArbitraryActionsExecuted>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.ArbitraryActionsExecuted> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.ArbitraryActionsExecuted>(
      entities.ArbitraryActionsExecuted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ArbitraryActionsExecuted)[],
      [],
    );

  return ensureSingleStoredItem(result, "ArbitraryActionsExecuted").data;
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
  dbUtils.BlockchainEventRepository,
  Partial<entities.OFTSent>,
  entities.OFTSent
> = async (
  event: Partial<entities.OFTSent>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.OFTSent> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.OFTSent>(
      entities.OFTSent,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTSent)[],
      [],
    );

  return ensureSingleStoredItem(result, "OFTSent").data;
};

/**
 * Stores an OFTReceived event in the database.
 *
 * @param event The OFTReceived entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeOFTReceivedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.OFTReceived>,
  entities.OFTReceived
> = async (
  event: Partial<entities.OFTReceived>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.OFTReceived> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.OFTReceived>(
      entities.OFTReceived,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTReceived)[],
      [],
    );

  return ensureSingleStoredItem(result, "OFTReceived").data;
};

/**
 * Stores a SponsoredOFTSend event in the database.
 *
 * @param event The SponsoredOFTSend entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredOFTSendEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.SponsoredOFTSend>,
  entities.SponsoredOFTSend
> = async (
  event: Partial<entities.SponsoredOFTSend>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.SponsoredOFTSend> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SponsoredOFTSend>(
      entities.SponsoredOFTSend,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredOFTSend)[],
      [],
    );

  return ensureSingleStoredItem(result, "SponsoredOFTSend").data;
};

/* ==================================================================================
 * SPOKE POOL STORING LOGIC
 * ================================================================================== */

export const storeFilledV3RelayEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.FilledV3Relay>,
  entities.FilledV3Relay
> = async (
  event: Partial<entities.FilledV3Relay>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.FilledV3Relay> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.FilledV3Relay>(
      entities.FilledV3Relay,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_INTERNAL_HASH as (keyof entities.FilledV3Relay)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.FilledV3Relay)[],
    );

  return ensureSingleStoredItem(result, "FilledV3Relay").data;
};

export const storeV3FundsDepositedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.V3FundsDeposited>,
  entities.V3FundsDeposited
> = async (
  event: Partial<entities.V3FundsDeposited>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.V3FundsDeposited> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.V3FundsDeposited>(
      entities.V3FundsDeposited,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_INTERNAL_HASH as (keyof entities.V3FundsDeposited)[],
      [],
    );

  return ensureSingleStoredItem(result, "V3FundsDeposited").data;
};

/**
 * Stores an ExecutedRelayerRefundRoot event in the database.
 *
 * @param event The ExecutedRelayerRefundRoot entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeExecutedRelayerRefundRootEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.ExecutedRelayerRefundRoot>,
  entities.ExecutedRelayerRefundRoot
> = async (
  event: Partial<entities.ExecutedRelayerRefundRoot>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.ExecutedRelayerRefundRoot> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.ExecutedRelayerRefundRoot>(
      entities.ExecutedRelayerRefundRoot,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN as (keyof entities.ExecutedRelayerRefundRoot)[],
      [],
    );

  return ensureSingleStoredItem(result, "ExecutedRelayerRefundRoot").data;
};

export const storeRequestedSpeedUpV3DepositEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.RequestedSpeedUpV3Deposit>,
  entities.RequestedSpeedUpV3Deposit
> = async (
  event: Partial<entities.RequestedSpeedUpV3Deposit>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.RequestedSpeedUpV3Deposit> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.RequestedSpeedUpV3Deposit>(
      entities.RequestedSpeedUpV3Deposit,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_SPEED_UP_V3_DEPOSIT_ID_ORIGIN_CHAIN_TX_HASH_LOG_IDX as (keyof entities.RequestedSpeedUpV3Deposit)[],
      [],
    );

  return ensureSingleStoredItem(result, "RequestedSpeedUpV3Deposit").data;
};

/**
 * Stores a RelayedRootBundle event in the database.
 *
 * @param event The RelayedRootBundle entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeRelayedRootBundleEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.RelayedRootBundle>,
  entities.RelayedRootBundle
> = async (
  event: Partial<entities.RelayedRootBundle>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.RelayedRootBundle> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.RelayedRootBundle>(
      entities.RelayedRootBundle,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_RELAYED_ROOT_BUNDLE as (keyof entities.RelayedRootBundle)[],
      [],
    );

  return ensureSingleStoredItem(result, "RelayedRootBundle").data;
};

/**
 * Stores a RequestedSlowFill event in the database.
 *
 * @param event The RequestedV3SlowFill entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeRequestedSlowFillEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.RequestedV3SlowFill>,
  entities.RequestedV3SlowFill
> = async (
  event: Partial<entities.RequestedV3SlowFill>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.RequestedV3SlowFill> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.RequestedV3SlowFill>(
      entities.RequestedV3SlowFill,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_INTERNAL_HASH as (keyof entities.RequestedV3SlowFill)[],
      [],
    );

  return ensureSingleStoredItem(result, "RequestedV3SlowFill").data;
};

/**
 * Stores a TokensBridged event in the database.
 *
 * @param event The TokensBridged entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeTokensBridgedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.TokensBridged>,
  entities.TokensBridged
> = async (
  event: Partial<entities.TokensBridged>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.TokensBridged> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.TokensBridged>(
      entities.TokensBridged,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_TOKENS_BRIDGED as (keyof entities.TokensBridged)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.TokensBridged)[],
    );

  return ensureSingleStoredItem(result, "TokensBridged").data;
};

/**
 * Stores a ClaimedRelayerRefund event in the database.
 *
 * @param event The ClaimedRelayerRefunds entity to store.
 * @param repository The BlockchainEventRepository instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeClaimedRelayerRefundEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.ClaimedRelayerRefunds>,
  entities.ClaimedRelayerRefunds
> = async (
  event: Partial<entities.ClaimedRelayerRefunds>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.ClaimedRelayerRefunds> => {
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.ClaimedRelayerRefunds>(
      entities.ClaimedRelayerRefunds,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ClaimedRelayerRefunds)[],
      [],
    );

  return ensureSingleStoredItem(result, "ClaimedRelayerRefund").data;
};
