import { entities, SaveQueryResult } from "@repo/indexer-database";
import {
  utils as dbUtils,
  DataSourceType,
  DataSource,
} from "@repo/indexer-database";
import { Storer } from "../model/genericTypes";
import { Logger } from "winston";

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
 * @param dataSource The TypeORM DataSource instance.
 * @param logger The logger instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSponsoredDepositForBurnEvent = async (
  event: Partial<entities.SponsoredDepositForBurn>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SponsoredDepositForBurn> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a DepositForBurn event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeDepositForBurnEvent = async (
  event: Partial<entities.DepositForBurn>,
  db: DataSource,
  logger: Logger,
): Promise<entities.DepositForBurn> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
      entities.DepositForBurn,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
      [],
    );

  return ensureSingleStoredItem(result, "DepositForBurn").data;
};

/**
 * Stores a MessageSent event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeMessageSentEvent = async (
  event: Partial<entities.MessageSent>,
  db: DataSource,
  logger: Logger,
): Promise<entities.MessageSent> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.MessageSent>(
      entities.MessageSent,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
      [],
    );

  return ensureSingleStoredItem(result, "MessageSent").data;
};

/**
 * Stores a MessageReceived event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeMessageReceivedEvent = async (
  event: Partial<entities.MessageReceived>,
  db: DataSource,
  logger: Logger,
): Promise<entities.MessageReceived> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.MessageReceived>(
      entities.MessageReceived,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageReceived)[],
      [],
    );

  return ensureSingleStoredItem(result, "MessageReceived").data;
};

/**
 * Stores a MintAndWithdraw event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeMintAndWithdrawEvent = async (
  event: Partial<entities.MintAndWithdraw>,
  db: DataSource,
  logger: Logger,
): Promise<entities.MintAndWithdraw> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * @param dataSource The TypeORM DataSource instance.
 * @returns A promise that resolves to the result of the save operation.
 */
export const storeSwapFlowInitializedEvent = async (
  event: Partial<entities.SwapFlowInitialized>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SwapFlowInitialized> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a SwapFlowFinalized event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeSwapFlowFinalizedEvent = async (
  event: Partial<entities.SwapFlowFinalized>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SwapFlowFinalized> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a SponsoredAccountActivation event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeSponsoredAccountActivationEvent = async (
  event: Partial<entities.SponsoredAccountActivation>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SponsoredAccountActivation> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a SimpleTransferFlowCompleted event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeSimpleTransferFlowCompletedEvent = async (
  event: Partial<entities.SimpleTransferFlowCompleted>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SimpleTransferFlowCompleted> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a FallbackHyperEVMFlowCompleted event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeFallbackHyperEVMFlowCompletedEvent = async (
  event: Partial<entities.FallbackHyperEVMFlowCompleted>,
  db: DataSource,
  logger: Logger,
): Promise<entities.FallbackHyperEVMFlowCompleted> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores an ArbitraryActionsExecuted event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeArbitraryActionsExecutedEvent = async (
  event: Partial<entities.ArbitraryActionsExecuted>,
  db: DataSource,
  logger: Logger,
): Promise<entities.ArbitraryActionsExecuted> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores an OFTSent event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeOFTSentEvent = async (
  event: Partial<entities.OFTSent>,
  db: DataSource,
  logger: Logger,
): Promise<entities.OFTSent> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a OFTReceived event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeOFTReceivedEvent = async (
  event: Partial<entities.OFTReceived>,
  db: DataSource,
  logger: Logger,
): Promise<entities.OFTReceived> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a SponsoredOFTSend event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeSponsoredOFTSendEvent = async (
  event: Partial<entities.SponsoredOFTSend>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SponsoredOFTSend> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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

/**
 * Stores a FilledV3Relay event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeFilledV3RelayEvent = async (
  event: Partial<entities.FilledV3Relay>,
  db: DataSource,
  logger: Logger,
): Promise<entities.FilledV3Relay> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.FilledV3Relay>(
      entities.FilledV3Relay,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_INTERNAL_HASH as (keyof entities.FilledV3Relay)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.FilledV3Relay)[],
    );

  return ensureSingleStoredItem(result, "FilledV3Relay").data;
};

/**
 * Stores a V3FundsDeposited event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeV3FundsDepositedEvent = async (
  event: Partial<entities.V3FundsDeposited>,
  db: DataSource,
  logger: Logger,
): Promise<entities.V3FundsDeposited> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores an ExecutedRelayerRefundRoot event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeExecutedRelayerRefundRootEvent = async (
  event: Partial<entities.ExecutedRelayerRefundRoot>,
  db: DataSource,
  logger: Logger,
): Promise<entities.ExecutedRelayerRefundRoot> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.ExecutedRelayerRefundRoot>(
      entities.ExecutedRelayerRefundRoot,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN as (keyof entities.ExecutedRelayerRefundRoot)[],
      [],
    );

  return ensureSingleStoredItem(result, "ExecutedRelayerRefundRoot").data;
};

/**
 * Stores a RequestedSpeedUpV3Deposit event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeRequestedSpeedUpV3DepositEvent = async (
  event: Partial<entities.RequestedSpeedUpV3Deposit>,
  db: DataSource,
  logger: Logger,
): Promise<entities.RequestedSpeedUpV3Deposit> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a RelayedRootBundle event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeRelayedRootBundleEvent = async (
  event: Partial<entities.RelayedRootBundle>,
  db: DataSource,
  logger: Logger,
): Promise<entities.RelayedRootBundle> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a RequestedV3SlowFill event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeRequestedSlowFillEvent = async (
  event: Partial<entities.RequestedV3SlowFill>,
  db: DataSource,
  logger: Logger,
): Promise<entities.RequestedV3SlowFill> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a TokensBridged event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeTokensBridgedEvent = async (
  event: Partial<entities.TokensBridged>,
  db: DataSource,
  logger: Logger,
): Promise<entities.TokensBridged> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
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
 * Stores a ClaimedRelayerRefund event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeClaimedRelayerRefundEvent = async (
  event: Partial<entities.ClaimedRelayerRefunds>,
  db: DataSource,
  logger: Logger,
): Promise<entities.ClaimedRelayerRefunds> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.ClaimedRelayerRefunds>(
      entities.ClaimedRelayerRefunds,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ClaimedRelayerRefunds)[],
      [],
    );

  return ensureSingleStoredItem(result, "ClaimedRelayerRefund").data;
};

/**
 * Stores a SwapBeforeBridge event.
 * @param event The event data
 * @param dataSource The TypeORM DataSource instance
 */
export const storeSwapBeforeBridgeEvent = async (
  event: Partial<entities.SwapBeforeBridge>,
  db: DataSource,
  logger: Logger,
): Promise<entities.SwapBeforeBridge> => {
  const repository = new dbUtils.BlockchainEventRepository(db, logger);
  const result =
    await repository.saveAndHandleFinalisationBatch<entities.SwapBeforeBridge>(
      entities.SwapBeforeBridge,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapBeforeBridge)[],
      [],
    );

  return ensureSingleStoredItem(result, "SwapBeforeBridge").data;
};
