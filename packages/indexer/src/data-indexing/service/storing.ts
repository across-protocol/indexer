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
const UK_TOKENS_BRIDGED = [
  "chainId",
  "leafId",
  "l2TokenAddress",
  "transactionHash",
];

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
  return (
    await repository.saveAndHandleFinalisation<entities.SponsoredDepositForBurn>(
      entities.SponsoredDepositForBurn,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredDepositForBurn)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.DepositForBurn>(
      entities.DepositForBurn,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.DepositForBurn)[],
      [],
    )
  ).data;
};

export const storeMessageSentEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MessageSent>,
  entities.MessageSent
> = async (
  event: Partial<entities.MessageSent>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MessageSent> => {
  return (
    await repository.saveAndHandleFinalisation<entities.MessageSent>(
      entities.MessageSent,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageSent)[],
      [],
    )
  ).data;
};

export const storeMessageReceivedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MessageReceived>,
  entities.MessageReceived
> = async (
  event: Partial<entities.MessageReceived>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MessageReceived> => {
  return (
    await repository.saveAndHandleFinalisation<entities.MessageReceived>(
      entities.MessageReceived,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MessageReceived)[],
      [],
    )
  ).data;
};

export const storeMintAndWithdrawEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.MintAndWithdraw>,
  entities.MintAndWithdraw
> = async (
  event: Partial<entities.MintAndWithdraw>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.MintAndWithdraw> => {
  return (
    await repository.saveAndHandleFinalisation<entities.MintAndWithdraw>(
      entities.MintAndWithdraw,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.MintAndWithdraw)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.SwapFlowInitialized>(
      entities.SwapFlowInitialized,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowInitialized)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.SwapFlowFinalized>(
      entities.SwapFlowFinalized,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SwapFlowFinalized)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.SponsoredAccountActivation>(
      entities.SponsoredAccountActivation,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredAccountActivation)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.SimpleTransferFlowCompleted>(
      entities.SimpleTransferFlowCompleted,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SimpleTransferFlowCompleted)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.FallbackHyperEVMFlowCompleted>(
      entities.FallbackHyperEVMFlowCompleted,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.FallbackHyperEVMFlowCompleted)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.ArbitraryActionsExecuted>(
      entities.ArbitraryActionsExecuted,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ArbitraryActionsExecuted)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.OFTSent>(
      entities.OFTSent,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTSent)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.OFTReceived>(
      entities.OFTReceived,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_CHAIN_BLOCKHASH_LOG as (keyof entities.OFTReceived)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.SponsoredOFTSend>(
      entities.SponsoredOFTSend,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.SponsoredOFTSend)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.FilledV3Relay>(
      entities.FilledV3Relay,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_INTERNAL_HASH as (keyof entities.FilledV3Relay)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.FilledV3Relay)[],
    )
  ).data;
};

export const storeV3FundsDepositedEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.V3FundsDeposited>,
  entities.V3FundsDeposited
> = async (
  event: Partial<entities.V3FundsDeposited>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.V3FundsDeposited> => {
  return (
    await repository.saveAndHandleFinalisation<entities.V3FundsDeposited>(
      entities.V3FundsDeposited,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_INTERNAL_HASH as (keyof entities.V3FundsDeposited)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.ExecutedRelayerRefundRoot>(
      entities.ExecutedRelayerRefundRoot,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_REFUND_ROOT_CHAIN_BUNDLE_LEAF_TXN as (keyof entities.ExecutedRelayerRefundRoot)[],
      [],
    )
  ).data;
};

export const storeRequestedSpeedUpV3DepositEvent: Storer<
  dbUtils.BlockchainEventRepository,
  Partial<entities.RequestedSpeedUpV3Deposit>,
  entities.RequestedSpeedUpV3Deposit
> = async (
  event: Partial<entities.RequestedSpeedUpV3Deposit>,
  repository: dbUtils.BlockchainEventRepository,
): Promise<entities.RequestedSpeedUpV3Deposit> => {
  return (
    await repository.saveAndHandleFinalisation<entities.RequestedSpeedUpV3Deposit>(
      entities.RequestedSpeedUpV3Deposit,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_SPEED_UP_V3_DEPOSIT_ID_ORIGIN_CHAIN_TX_HASH_LOG_IDX as (keyof entities.RequestedSpeedUpV3Deposit)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.RelayedRootBundle>(
      entities.RelayedRootBundle,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_RELAYED_ROOT_BUNDLE as (keyof entities.RelayedRootBundle)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.RequestedV3SlowFill>(
      entities.RequestedV3SlowFill,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_INTERNAL_HASH as (keyof entities.RequestedV3SlowFill)[],
      [],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.TokensBridged>(
      entities.TokensBridged,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      UK_TOKENS_BRIDGED as (keyof entities.TokensBridged)[],
      UPDATE_TRANSACTION_HASH as (keyof entities.TokensBridged)[],
    )
  ).data;
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
  return (
    await repository.saveAndHandleFinalisation<entities.ClaimedRelayerRefunds>(
      entities.ClaimedRelayerRefunds,
      { ...event, dataSource: DataSourceType.WEB_SOCKET },
      PK_CHAIN_BLOCK_TX_LOG as (keyof entities.ClaimedRelayerRefunds)[],
      [],
    )
  ).data;
};
