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
 * Stores a SponsoredDepositForBurn event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeSponsoredDepositForBurnEvent: Storer<
  Partial<entities.SponsoredDepositForBurn>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SponsoredDepositForBurn>
> = async (
  event: Partial<entities.SponsoredDepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SponsoredDepositForBurn>(
      entities.SponsoredDepositForBurn,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredDepositForBurn)[],
      [],
    );
    return ensureSingleStoredItem(results, "SponsoredDepositForBurn");
  };

/**
 * Stores a DepositForBurn event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeDepositForBurnEvent: Storer<
  Partial<entities.DepositForBurn>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.DepositForBurn>
> = async (
  event: Partial<entities.DepositForBurn>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
      entities.DepositForBurn,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
      [],
    );
    return ensureSingleStoredItem(results, "DepositForBurn");
  };

/**
 * Stores a MessageSent event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeMessageSentEvent: Storer<
  Partial<entities.MessageSent>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.MessageSent>
> = async (
  event: Partial<entities.MessageSent>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.MessageSent>(
      entities.MessageSent,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
      [],
    );
    return ensureSingleStoredItem(results, "MessageSent");
  };

/**
 * Stores a MessageReceived event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeMessageReceivedEvent: Storer<
  Partial<entities.MessageReceived>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.MessageReceived> 
> = async (
  event: Partial<entities.MessageReceived>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.MessageReceived>(
      entities.MessageReceived,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageReceived)[],
      [],
    );
  return ensureSingleStoredItem(results, "MessageReceived");
  };

/**
 * Stores a MintAndWithdraw event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeMintAndWithdrawEvent: Storer<
  Partial<entities.MintAndWithdraw>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.MintAndWithdraw> 
> = async (
  event: Partial<entities.MintAndWithdraw>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.MintAndWithdraw>(
      entities.MintAndWithdraw,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MintAndWithdraw)[],
      [],
    );
  return ensureSingleStoredItem(results, "MintAndWithdraw");
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
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SwapFlowInitialized> 
> = async (
  event: Partial<entities.SwapFlowInitialized>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SwapFlowInitialized>(
      entities.SwapFlowInitialized,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowInitialized)[],
      [],
    );
  return ensureSingleStoredItem(results, "SwapFlowInitialized");
  };

/**
 * Stores a SwapFlowFinalized event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeSwapFlowFinalizedEvent: Storer<
  Partial<entities.SwapFlowFinalized>,
  dbUtils.BlockchainEventRepository,
  entities.SwapFlowFinalized 
> = async (
  event: Partial<entities.SwapFlowFinalized>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SwapFlowFinalized>(
      entities.SwapFlowFinalized,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET }],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowFinalized)[],
      [],
    );
   return (await ensureSingleStoredItem(results, "SwapFlowFinalized")).data;
  };

/**
 * Stores a SponsoredAccountActivation event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeSponsoredAccountActivationEvent: Storer<
  Partial<entities.SponsoredAccountActivation>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SponsoredAccountActivation> 
> = async (
  event: Partial<entities.SponsoredAccountActivation>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SponsoredAccountActivation>(
      entities.SponsoredAccountActivation,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredAccountActivation)[],
      [],
    );
  return ensureSingleStoredItem(results, "SponsoredAccountActivation");
  };

/**
 * Stores a SimpleTransferFlowCompleted event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeSimpleTransferFlowCompletedEvent: Storer<
  Partial<entities.SimpleTransferFlowCompleted>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SimpleTransferFlowCompleted> 
> = async (
  event: Partial<entities.SimpleTransferFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
      entities.SimpleTransferFlowCompleted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SimpleTransferFlowCompleted)[],
      [],
    );
  return ensureSingleStoredItem(results, "SimpleTransferFlowCompleted");
  };

/**
 * Stores a FallbackHyperEVMFlowCompleted event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeFallbackHyperEVMFlowCompletedEvent: Storer<
  Partial<entities.FallbackHyperEVMFlowCompleted>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.FallbackHyperEVMFlowCompleted>
> = async (
  event: Partial<entities.FallbackHyperEVMFlowCompleted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.FallbackHyperEVMFlowCompleted>(
      entities.FallbackHyperEVMFlowCompleted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.FallbackHyperEVMFlowCompleted)[],
      [],
    );
    return ensureSingleStoredItem(results, "FallbackHyperEVMFlowCompleted");
  };

/**
 * Stores an ArbitraryActionsExecuted event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeArbitraryActionsExecutedEvent: Storer<
  Partial<entities.ArbitraryActionsExecuted>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.ArbitraryActionsExecuted> 
> = async (
  event: Partial<entities.ArbitraryActionsExecuted>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.ArbitraryActionsExecuted>(
      entities.ArbitraryActionsExecuted,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ArbitraryActionsExecuted)[],
      [],
    );
  return ensureSingleStoredItem(results, "ArbitraryActionsExecuted");
  };

/**
 * Stores an OFTSent event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeOFTSentEvent: Storer<
  Partial<entities.OFTSent>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.OFTSent> 
> = async (
  event: Partial<entities.OFTSent>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.OFTSent>(
      entities.OFTSent,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTSent)[],
      [],
    );
  return ensureSingleStoredItem(results, "OFTSent");
  };

/**
 * Stores a OFTReceived event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeOFTReceivedEvent: Storer<
  Partial<entities.OFTReceived>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.OFTReceived> 
> = async (
  event: Partial<entities.OFTReceived>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.OFTReceived>(
      entities.OFTReceived,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTReceived)[],
      [],
    );
  return ensureSingleStoredItem(results, "OFTReceived");
  };

/**
 * Stores a SponsoredOFTSend event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeSponsoredOFTSendEvent: Storer<
  Partial<entities.SponsoredOFTSend>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SponsoredOFTSend> 
> = async (
  event: Partial<entities.SponsoredOFTSend>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SponsoredOFTSend>(
      entities.SponsoredOFTSend,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredOFTSend)[],
      [],
    );
  return ensureSingleStoredItem(results, "SponsoredOFTSend");
  };

/**
 * Stores a FilledV3Relay event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeFilledV3RelayEvent: Storer<
  Partial<entities.FilledV3Relay>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.FilledV3Relay> 
> = async (
  event: Partial<entities.FilledV3Relay>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.FilledV3Relay>(
      entities.FilledV3Relay,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_INTERNAL_HASH as (keyof entities.FilledV3Relay)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.FilledV3Relay)[],
    );
  return ensureSingleStoredItem(results, "FilledV3Relay");
  };

/**
 * Stores a V3FundsDeposited event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeV3FundsDepositedEvent: Storer<
  Partial<entities.V3FundsDeposited>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.V3FundsDeposited> 
> = async (
  event: Partial<entities.V3FundsDeposited>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.V3FundsDeposited>(
      entities.V3FundsDeposited,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_INTERNAL_HASH as (keyof entities.V3FundsDeposited)[],
      [],
    );
  return ensureSingleStoredItem(results, "V3FundsDeposited");
  };

/**
 * Stores an ExecutedRelayerRefundRoot event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeExecutedRelayerRefundRootEvent: Storer<
  Partial<entities.ExecutedRelayerRefundRoot>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.ExecutedRelayerRefundRoot> 
> = async (
  event: Partial<entities.ExecutedRelayerRefundRoot>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.ExecutedRelayerRefundRoot>(
      entities.ExecutedRelayerRefundRoot,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN as (keyof entities.ExecutedRelayerRefundRoot)[],
      [],
    );
  return ensureSingleStoredItem(results, "ExecutedRelayerRefundRoot");
  };

/**
 * Stores a RequestedSpeedUpV3Deposit event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeRequestedSpeedUpV3DepositEvent: Storer<
  Partial<entities.RequestedSpeedUpV3Deposit>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.RequestedSpeedUpV3Deposit> 
> = async (
  event: Partial<entities.RequestedSpeedUpV3Deposit>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.RequestedSpeedUpV3Deposit>(
      entities.RequestedSpeedUpV3Deposit,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_SPEED_UP_V3_DEPOSIT_ID_ORIGIN_CHAIN_TX_HASH_LOG_IDX as (keyof entities.RequestedSpeedUpV3Deposit)[],
      [],
    );
  return ensureSingleStoredItem(results, "RequestedSpeedUpV3Deposit");
  };

/**
 * Stores a RelayedRootBundle event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeRelayedRootBundleEvent: Storer<
  Partial<entities.RelayedRootBundle>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.RelayedRootBundle> 
> = async (
  event: Partial<entities.RelayedRootBundle>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.RelayedRootBundle>(
      entities.RelayedRootBundle,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_RELAYED_ROOT_BUNDLE as (keyof entities.RelayedRootBundle)[],
      [],
    );
  return ensureSingleStoredItem(results, "RelayedRootBundle");
  };

/**
 * Stores a RequestedV3SlowFill event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeRequestedSlowFillEvent: Storer<
  Partial<entities.RequestedV3SlowFill>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.RequestedV3SlowFill> 
> = async (
  event: Partial<entities.RequestedV3SlowFill>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.RequestedV3SlowFill>(
      entities.RequestedV3SlowFill,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_INTERNAL_HASH as (keyof entities.RequestedV3SlowFill)[],
      [],
    );
  return ensureSingleStoredItem(results, "RequestedV3SlowFill");
  };

/**
 * Stores a TokensBridged event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeTokensBridgedEvent: Storer<
  Partial<entities.TokensBridged>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.TokensBridged> 
> = async (
  event: Partial<entities.TokensBridged>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.TokensBridged>(
      entities.TokensBridged,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      UK_TOKENS_BRIDGED as (keyof entities.TokensBridged)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.TokensBridged)[],
    );
  return ensureSingleStoredItem(results, "TokensBridged");
  };

/**
 * Stores a ClaimedRelayerRefund event.
 * @param event The event data
 * @param repository The blockchain event repository
 */
export const storeClaimedRelayerRefundEvent: Storer<
  Partial<entities.ClaimedRelayerRefunds>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.ClaimedRelayerRefunds> 
> = async (
  event: Partial<entities.ClaimedRelayerRefunds>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.ClaimedRelayerRefunds>(
      entities.ClaimedRelayerRefunds,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ClaimedRelayerRefunds)[],
      [],
    );
  return ensureSingleStoredItem(results, "ClaimedRelayerRefunds");
  };

/**
 * Stores a SwapBeforeBridge event into the database.
 * This is used for both the base and periphery contracts.
 * @param event The partial event entity to store
 * @param repository The blockchain event repository
 */
export const storeSwapBeforeBridgeEvent: Storer<
  Partial<entities.SwapBeforeBridge>,
  dbUtils.BlockchainEventRepository,
  SaveQueryResult<entities.SwapBeforeBridge> 
> = async (
  event: Partial<entities.SwapBeforeBridge>,
  repository: dbUtils.BlockchainEventRepository,
) => {
    const results = await repository.saveAndHandleFinalisationBatch<entities.SwapBeforeBridge>(
      entities.SwapBeforeBridge,
      [{ ...event, dataSource: DataSourceType.WEB_SOCKET } as any],
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapBeforeBridge)[],
      [],
    );
  return ensureSingleStoredItem(results, "SwapBeforeBridge");
  };
