import {
  getAddress,
  getSponsoredCCTPDstPeripheryAddress,
  getSponsoredCCTPSrcPeripheryAddress,
  getSponsoredOFTSrcPeripheryAddress,
  getDstOFTHandlerAddress,
} from "../../utils/contractUtils";
import { DataDogMetricsService } from "../../services/MetricsService";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
  CCTP_MESSAGE_SENT_ABI,
  SPONSORED_DEPOSIT_FOR_BURN_ABI,
  CCTP_MINT_AND_WITHDRAW_ABI,
  SPONSORED_ACCOUNT_ACTIVATION_ABI,
  SIMPLE_TRANSFER_FLOW_COMPLETED_ABI,
  FALLBACK_HYPER_EVM_FLOW_COMPLETED_ABI,
  ARBITRARY_ACTIONS_EXECUTED_ABI,
  FILLED_RELAY_V3_ABI,
  FUNDS_DEPOSITED_V3_ABI,
  EXECUTED_RELAYER_REFUND_ROOT_ABI,
  REQUESTED_SPEED_UP_V3_DEPOSIT_ABI,
  RELAYED_ROOT_BUNDLE_ABI,
  REQUESTED_SLOW_FILL_ABI,
  TOKENS_BRIDGED_ABI,
  CLAIMED_RELAYER_REFUND_ABI,
  SWAP_BEFORE_BRIDGE_ABI,
} from "../model/abis";
import {
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_RECEIVED_EVENT_NAME,
  MESSAGE_SENT_EVENT_NAME,
  MINT_AND_WITHDRAW_EVENT_NAME,
  MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
  MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  TOKEN_MESSENGER_ADDRESS_TESTNET,
  SWAP_FLOW_FINALIZED_EVENT_NAME,
  SWAP_FLOW_INITIALIZED_EVENT_NAME,
  SPONSORED_ACCOUNT_ACTIVATION_EVENT_NAME,
  SIMPLE_TRANSFER_FLOW_COMPLETED_EVENT_NAME,
  FALLBACK_HYPER_EVM_FLOW_COMPLETED_EVENT_NAME,
  ARBITRARY_ACTIONS_EXECUTED_EVENT_NAME,
  SPONSORED_DEPOSIT_FOR_BURN_EVENT_NAME,
  FILLED_RELAY_V3_EVENT_NAME,
  FUNDS_DEPOSITED_V3_EVENT_NAME,
  EXECUTED_RELAYER_REFUND_ROOT_EVENT_NAME,
  REQUESTED_SPEED_UP_V3_DEPOSIT_EVENT_NAME,
  RELAYED_ROOT_BUNDLE_EVENT_NAME,
  REQUESTED_SLOW_FILL_EVENT_NAME,
  TOKENS_BRIDGED_EVENT_NAME,
  CLAIMED_RELAYER_REFUND_EVENT_NAME,
  SWAP_BEFORE_BRIDGE_EVENT_NAME,
} from "./constants";
import { IndexerEventPayload } from "./genericEventListening";
import { IndexerEventHandler } from "./genericIndexing";
import { Logger } from "winston";
import {
  extractRawArgs,
  preprocessSponsoredDepositForBurn,
} from "./preprocessing";
import {
  DepositForBurnArgs,
  EventArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  SponsoredDepositForBurnArgs,
  MintAndWithdrawArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
  SponsoredAccountActivationArgs,
  SimpleTransferFlowCompletedArgs,
  FallbackHyperEVMFlowCompletedArgs,
  ArbitraryActionsExecutedArgs,
  FilledV3RelayArgs,
  V3FundsDepositedArgs,
  ExecutedRelayerRefundRootArgs,
  RequestedSpeedUpV3DepositArgs,
  RelayedRootBundleArgs,
  RequestedSlowFillArgs,
  TokensBridgedArgs,
  ClaimedRelayerRefundArgs,
  SwapBeforeBridgeArgs,
} from "../model/eventTypes";

import {
  createCctpBurnFilter,
  createCctpMintFilter,
  filterDepositForBurnEvents,
  filterMessageReceived,
} from "./filtering";
import {
  transformDepositForBurnEvent,
  transformMessageReceivedEvent,
  transformMessageSentEvent,
  transformSponsoredDepositForBurnEvent,
  transformMintAndWithdrawEvent,
  transformSwapFlowFinalizedEvent,
  transformSwapFlowInitializedEvent,
  transformSponsoredAccountActivationEvent,
  transformSimpleTransferFlowCompletedEvent,
  transformFallbackHyperEVMFlowCompletedEvent,
  transformArbitraryActionsExecutedEvent,
  transformFilledV3RelayEvent,
  transformV3FundsDepositedEvent,
  transformExecutedRelayerRefundRootEvent,
  transformRequestedSpeedUpV3DepositEvent,
  transformRelayedRootBundleEvent,
  transformRequestedSlowFillEvent,
  transformTokensBridgedEvent,
  transformClaimedRelayerRefundEvent,
  transformSwapBeforeBridgeEvent,
} from "./transforming";
import {
  storeDepositForBurnEvent,
  storeMessageReceivedEvent,
  storeMessageSentEvent,
  storeSponsoredDepositForBurnEvent,
  storeMintAndWithdrawEvent,
  storeSwapFlowFinalizedEvent,
  storeSwapFlowInitializedEvent,
  storeSponsoredAccountActivationEvent,
  storeSimpleTransferFlowCompletedEvent,
  storeFallbackHyperEVMFlowCompletedEvent,
  storeArbitraryActionsExecutedEvent,
  storeOFTSentEvent,
  storeOFTReceivedEvent,
  storeFilledV3RelayEvent,
  storeV3FundsDepositedEvent,
  storeExecutedRelayerRefundRootEvent,
  storeRequestedSpeedUpV3DepositEvent,
  storeRelayedRootBundleEvent,
  storeRequestedSlowFillEvent,
  storeTokensBridgedEvent,
  storeClaimedRelayerRefundEvent,
  storeSponsoredOFTSendEvent,
  storeSwapBeforeBridgeEvent,
} from "./storing";
import { Entity, ObjectLiteral } from "typeorm";
import { TEST_NETWORKS } from "@across-protocol/constants";
import {
  SWAP_FLOW_FINALIZED_ABI,
  SWAP_FLOW_INITIALIZED_ABI,
  OFT_SENT_ABI,
  OFT_RECEIVED_ABI,
  SPONSORED_OFT_SEND_ABI,
} from "../model/abis";
import {
  OFT_SENT_EVENT_NAME,
  OFT_RECEIVED_EVENT_NAME,
  SPONSORED_OFT_SEND_EVENT_NAME,
} from "./constants";
import {
  OFTSentArgs,
  OFTReceivedArgs,
  SponsoredOFTSendArgs,
} from "../model/eventTypes";
import { filterOFTSentEvents, filterOFTReceivedEvents } from "./filtering";
import {
  transformOFTSentEvent,
  transformOFTReceivedEvent,
  transformSponsoredOFTSendEvent,
} from "./transforming";
import {
  getOftChainConfiguration,
  getSupportOftChainIds,
} from "../adapter/oft/service";
import { Config } from "../../parseEnv";
import { DataSource, entities } from "@repo/indexer-database";
import {
  postProcessDepositEvent,
  postProcessSwapBeforeBridge,
} from "./postprocessing";
import { BlockchainEventRepository } from "../../../../indexer-database/dist/src/utils/BlockchainEventRepository";
import {
  SwapBeforeBridge,
  V3FundsDeposited,
} from "../../../../indexer-database/dist/src/entities";

/**
 * Array of event handlers.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TTransformed The type of the transformed data.
 * @template TStored The type of the stored data.
 */
type EventHandlers<TDb, TPayload, TPreprocessed, TTransformed, TStored> = Array<
  IndexerEventHandler<TDb, TPayload, TPreprocessed, TTransformed, TStored>
>;

/**
 * Request object for getting event handlers.
 * @property logger - The logger instance.
 * @property chainId - The chain ID.
 * @property metrics - The metrics service instance.
 */
type GetEventHandlersRequest = {
  logger: Logger;
  chainId: number;
  metrics?: DataDogMetricsService;
};

/**
 * Configuration for a complete indexing subsystem.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 * @template TTransformed The type of the transformed data.
 * @template TStored The type of the stored data.
 */
export interface SupportedProtocols<
  TDb,
  TPayload,
  TPreprocessed,
  TTransformed,
  TStored,
> {
  /**
   * Returns the list of event configurations for this protocol.
   * "TPreprocessed extends any" forces TypeScript to distribute the Union.
   * It means: "Allow an array where items can be Handler<Deposit> OR Handler<Message>".
   */
  getEventHandlers: (
    request: GetEventHandlersRequest,
  ) => EventHandlers<TDb, TPayload, TPreprocessed, TTransformed, TStored>;
}

/**
 * Configuration for CCTP protocol.
 * @template BlockchainEventRepository The type of the database client/connection.
 * @template IndexerEventPayload The type of the event payload from the event listener.
 * @template EventArgs The type of the preprocessed data.
 */
export const CCTP_PROTOCOL: SupportedProtocols<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> = {
  getEventHandlers: ({ logger, chainId }: GetEventHandlersRequest) => {
    const testNet = chainId in TEST_NETWORKS;
    return [
      {
        config: {
          address: testNet
            ? TOKEN_MESSENGER_ADDRESS_TESTNET
            : TOKEN_MESSENGER_ADDRESS_MAINNET,
          abi: CCTP_DEPOSIT_FOR_BURN_ABI,
          eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
        },
        preprocess: extractRawArgs<DepositForBurnArgs>,
        filter: (args: EventArgs, payload: IndexerEventPayload) =>
          filterDepositForBurnEvents(args as DepositForBurnArgs, payload),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformDepositForBurnEvent(
            args as DepositForBurnArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeDepositForBurnEvent(event, dataSource, logger),
      },
      {
        config: {
          address: testNet
            ? MESSAGE_TRANSMITTER_ADDRESS_TESTNET
            : MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
          abi: CCTP_MESSAGE_SENT_ABI,
          eventName: MESSAGE_SENT_EVENT_NAME,
        },
        preprocess: extractRawArgs<MessageSentArgs>,
        filter: (_args: EventArgs, payload: IndexerEventPayload) =>
          createCctpBurnFilter(payload, logger),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformMessageSentEvent(args as MessageSentArgs, payload, logger),
        store: (event, dataSource) =>
          storeMessageSentEvent(event, dataSource, logger),
      },
      {
        config: {
          address: testNet
            ? MESSAGE_TRANSMITTER_ADDRESS_TESTNET
            : MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
          abi: CCTP_MESSAGE_RECEIVED_ABI,
          eventName: MESSAGE_RECEIVED_EVENT_NAME,
        },
        preprocess: extractRawArgs<MessageReceivedArgs>,
        filter: (args: EventArgs, payload: IndexerEventPayload) =>
          filterMessageReceived(args as MessageReceivedArgs, payload, logger),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformMessageReceivedEvent(
            args as MessageReceivedArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeMessageReceivedEvent(event, dataSource, logger),
      },
      {
        config: {
          address: testNet
            ? TOKEN_MESSENGER_ADDRESS_TESTNET
            : TOKEN_MESSENGER_ADDRESS_MAINNET,
          abi: CCTP_MINT_AND_WITHDRAW_ABI,
          eventName: MINT_AND_WITHDRAW_EVENT_NAME,
        },
        preprocess: extractRawArgs<MintAndWithdrawArgs>,
        filter: (_args: EventArgs, payload: IndexerEventPayload) =>
          createCctpMintFilter(payload, logger),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformMintAndWithdrawEvent(
            args as MintAndWithdrawArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeMintAndWithdrawEvent(event, dataSource, logger),
      },
    ];
  },
};

/**
 * Returns the list of event handlers for sponsored bridging.
 * @param sponsorshipContractAddress The address of the contract.
 * @param logger The logger.
 * @returns The list of event handlers.
 */
export const getSponsoredBridgingEventHandlers = (
  sponsorshipContractAddress: string,
  logger: Logger,
): EventHandlers<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> => {
  return [
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SWAP_FLOW_FINALIZED_ABI,
        eventName: SWAP_FLOW_FINALIZED_EVENT_NAME,
      },
      preprocess: extractRawArgs<SwapFlowFinalizedArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformSwapFlowFinalizedEvent(
          args as SwapFlowFinalizedArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeSwapFlowFinalizedEvent(event, dataSource, logger),
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SWAP_FLOW_INITIALIZED_ABI,
        eventName: SWAP_FLOW_INITIALIZED_EVENT_NAME,
      },
      preprocess: extractRawArgs<SwapFlowInitializedArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformSwapFlowInitializedEvent(
          args as SwapFlowInitializedArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeSwapFlowInitializedEvent(event, dataSource, logger),
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SPONSORED_ACCOUNT_ACTIVATION_ABI,
        eventName: SPONSORED_ACCOUNT_ACTIVATION_EVENT_NAME,
      },
      preprocess: extractRawArgs<SponsoredAccountActivationArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformSponsoredAccountActivationEvent(
          args as SponsoredAccountActivationArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeSponsoredAccountActivationEvent(event, dataSource, logger),
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SIMPLE_TRANSFER_FLOW_COMPLETED_ABI,
        eventName: SIMPLE_TRANSFER_FLOW_COMPLETED_EVENT_NAME,
      },
      preprocess: extractRawArgs<SimpleTransferFlowCompletedArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformSimpleTransferFlowCompletedEvent(
          args as SimpleTransferFlowCompletedArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeSimpleTransferFlowCompletedEvent(event, dataSource, logger),
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: FALLBACK_HYPER_EVM_FLOW_COMPLETED_ABI,
        eventName: FALLBACK_HYPER_EVM_FLOW_COMPLETED_EVENT_NAME,
      },
      preprocess: extractRawArgs<FallbackHyperEVMFlowCompletedArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformFallbackHyperEVMFlowCompletedEvent(
          args as FallbackHyperEVMFlowCompletedArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeFallbackHyperEVMFlowCompletedEvent(event, dataSource, logger),
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: ARBITRARY_ACTIONS_EXECUTED_ABI,
        eventName: ARBITRARY_ACTIONS_EXECUTED_EVENT_NAME,
      },
      preprocess: extractRawArgs<ArbitraryActionsExecutedArgs>,
      filter: async () => true,
      transform: (args: EventArgs, payload: IndexerEventPayload) =>
        transformArbitraryActionsExecutedEvent(
          args as ArbitraryActionsExecutedArgs,
          payload,
          logger,
        ),
      store: (event, dataSource) =>
        storeArbitraryActionsExecutedEvent(event, dataSource, logger),
    },
  ];
};

export const SPONSORED_CCTP_PROTOCOL: SupportedProtocols<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> = {
  getEventHandlers: ({ logger, chainId }: GetEventHandlersRequest) => {
    // First let's get the regular CCTP handlers
    const handlers = CCTP_PROTOCOL.getEventHandlers({ logger, chainId });

    // Now let's see if for the given chainId there exists a sponsored CCTP src periphery
    const sourceSponsorhipContractAddress = getSponsoredCCTPSrcPeripheryAddress(
      chainId,
    ) as `0x${string}`;
    if (sourceSponsorhipContractAddress) {
      // If there is a sponsored CCTP src periphery, add the sponsored events from the source chain to the handlers.
      handlers.push({
        config: {
          address: sourceSponsorhipContractAddress,
          abi: SPONSORED_DEPOSIT_FOR_BURN_ABI,
          eventName: SPONSORED_DEPOSIT_FOR_BURN_EVENT_NAME,
        },
        preprocess: (payload: IndexerEventPayload) =>
          preprocessSponsoredDepositForBurn(payload, logger),
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformSponsoredDepositForBurnEvent(
            args as SponsoredDepositForBurnArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeSponsoredDepositForBurnEvent(event, dataSource, logger),
      });
    }

    // Now let's see if for the given chainId there exists a sponsored CCTP dst periphery
    const destinationSponsorhipContractAddress =
      getSponsoredCCTPDstPeripheryAddress(chainId) as `0x${string}`;

    // If the chain has a sponsored CCTP dst periphery, add the sponsored events from the destination chain to the handlers.
    if (destinationSponsorhipContractAddress) {
      handlers.push(
        ...getSponsoredBridgingEventHandlers(
          destinationSponsorhipContractAddress,
          logger,
        ),
      );
    }

    return handlers;
  },
};

/**
 * Configuration for OFT (Omnichain Fungible Token) protocol.
 * Unlike CCTP, OFT uses chain-specific adapter addresses that are looked up dynamically
 * using the chainId parameter passed to getEventHandlers.
 */
export const OFT_PROTOCOL: SupportedProtocols<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> = {
  getEventHandlers: ({ logger, chainId }: GetEventHandlersRequest) => {
    // Get chain-specific OFT configuration
    const oftConfig = getOftChainConfiguration(chainId);
    const adapterAddress = oftConfig.tokens[0]!.adapter;
    const tokenAddress = oftConfig.tokens[0]!.token;

    return [
      {
        config: {
          address: adapterAddress as `0x${string}`,
          abi: OFT_SENT_ABI,
          eventName: OFT_SENT_EVENT_NAME,
        },
        preprocess: extractRawArgs<OFTSentArgs>,
        filter: (args: EventArgs, payload: IndexerEventPayload) =>
          filterOFTSentEvents(args as OFTSentArgs, payload),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformOFTSentEvent(
            args as OFTSentArgs,
            payload,
            logger,
            tokenAddress,
          ),
        store: (event, dataSource) =>
          storeOFTSentEvent(event, dataSource, logger),
      },
      {
        config: {
          address: adapterAddress as `0x${string}`,
          abi: OFT_RECEIVED_ABI,
          eventName: OFT_RECEIVED_EVENT_NAME,
        },
        preprocess: extractRawArgs<OFTReceivedArgs>,
        filter: (args: EventArgs, payload: IndexerEventPayload) =>
          filterOFTReceivedEvents(args as OFTReceivedArgs, payload),
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformOFTReceivedEvent(
            args as OFTReceivedArgs,
            payload,
            logger,
            tokenAddress,
          ),
        store: (event, dataSource) =>
          storeOFTReceivedEvent(event, dataSource, logger),
      },
    ];
  },
};

export const SPOKE_POOL_PROTOCOL: SupportedProtocols<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> = {
  getEventHandlers: ({ logger, chainId }: GetEventHandlersRequest) => {
    return [
      {
        config: {
          abi: FILLED_RELAY_V3_ABI,
          eventName: FILLED_RELAY_V3_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<FilledV3RelayArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformFilledV3RelayEvent(
            args as FilledV3RelayArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeFilledV3RelayEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: FUNDS_DEPOSITED_V3_ABI,
          eventName: FUNDS_DEPOSITED_V3_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<V3FundsDepositedArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformV3FundsDepositedEvent(
            args as V3FundsDepositedArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeV3FundsDepositedEvent(event, dataSource, logger),
        postProcess: async (db, _, storedItem) => {
          await postProcessDepositEvent(db, storedItem as V3FundsDeposited);
        },
      },
      {
        config: {
          abi: EXECUTED_RELAYER_REFUND_ROOT_ABI,
          eventName: EXECUTED_RELAYER_REFUND_ROOT_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<ExecutedRelayerRefundRootArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformExecutedRelayerRefundRootEvent(
            args as ExecutedRelayerRefundRootArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeExecutedRelayerRefundRootEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: REQUESTED_SPEED_UP_V3_DEPOSIT_ABI,
          eventName: REQUESTED_SPEED_UP_V3_DEPOSIT_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<RequestedSpeedUpV3DepositArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformRequestedSpeedUpV3DepositEvent(
            args as RequestedSpeedUpV3DepositArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeRequestedSpeedUpV3DepositEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: RELAYED_ROOT_BUNDLE_ABI,
          eventName: RELAYED_ROOT_BUNDLE_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<RelayedRootBundleArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformRelayedRootBundleEvent(
            args as RelayedRootBundleArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeRelayedRootBundleEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: REQUESTED_SLOW_FILL_ABI,
          eventName: REQUESTED_SLOW_FILL_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<RequestedSlowFillArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformRequestedSlowFillEvent(
            args as RequestedSlowFillArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeRequestedSlowFillEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: TOKENS_BRIDGED_ABI,
          eventName: TOKENS_BRIDGED_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<TokensBridgedArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformTokensBridgedEvent(
            args as TokensBridgedArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeTokensBridgedEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: CLAIMED_RELAYER_REFUND_ABI,
          eventName: CLAIMED_RELAYER_REFUND_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: extractRawArgs<ClaimedRelayerRefundArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformClaimedRelayerRefundEvent(
            args as ClaimedRelayerRefundArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeClaimedRelayerRefundEvent(event, dataSource, logger),
      },
      {
        config: {
          abi: SWAP_BEFORE_BRIDGE_ABI,
          eventName: SWAP_BEFORE_BRIDGE_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`, // TODO: Check if address is correct for SwapBeforeBridge? It's periphery?
        },
        preprocess: extractRawArgs<SwapBeforeBridgeArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformSwapBeforeBridgeEvent(
            args as SwapBeforeBridgeArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeSwapBeforeBridgeEvent(event, dataSource, logger),
        postProcess: async (db, payload, storedItem) => {
          await postProcessSwapBeforeBridge({
            db,
            payload: payload as IndexerEventPayload,
            storedItem: storedItem as SwapBeforeBridge,
            logger,
          });
        },
      },
    ];
  },
};

/**
 * Configuration for OFT protocol with sponsored events.
 * Extends OFT_PROTOCOL with SponsoredOFTSend and destination handler events.
 */
export const SPONSORED_OFT_PROTOCOL: SupportedProtocols<
  DataSource,
  IndexerEventPayload,
  EventArgs,
  Partial<typeof Entity>,
  ObjectLiteral
> = {
  getEventHandlers: ({ logger, chainId }: GetEventHandlersRequest) => {
    // Get base OFT handlers (OFTSent, OFTReceived)
    const handlers = OFT_PROTOCOL.getEventHandlers({ logger, chainId });

    // Add SponsoredOFTSend handler if source periphery exists for this chain
    const sourcePeripheryAddress = getSponsoredOFTSrcPeripheryAddress(
      chainId,
    ) as `0x${string}`;
    if (sourcePeripheryAddress) {
      handlers.push({
        config: {
          address: sourcePeripheryAddress,
          abi: SPONSORED_OFT_SEND_ABI,
          eventName: SPONSORED_OFT_SEND_EVENT_NAME,
        },
        preprocess: extractRawArgs<SponsoredOFTSendArgs>,
        filter: async () => true,
        transform: (args: EventArgs, payload: IndexerEventPayload) =>
          transformSponsoredOFTSendEvent(
            args as SponsoredOFTSendArgs,
            payload,
            logger,
          ),
        store: (event, dataSource) =>
          storeSponsoredOFTSendEvent(event, dataSource, logger),
      });
    }

    // Add destination handler events if DstOFTHandler exists for this chain
    const dstOftHandlerAddress = getDstOFTHandlerAddress(
      chainId,
    ) as `0x${string}`;
    if (dstOftHandlerAddress) {
      handlers.push(
        ...getSponsoredBridgingEventHandlers(dstOftHandlerAddress, logger),
      );
    }

    return handlers;
  },
};

/**
 * Get configuration for supported protocols on different chains.
 */
export const getChainProtocols: (
  config: Config,
) => Record<
  number,
  SupportedProtocols<
    DataSource,
    IndexerEventPayload,
    EventArgs,
    Partial<typeof Entity>,
    ObjectLiteral
  >[]
> = (config: Config) => {
  // Initialize with empty array for each chain.
  const chainProtocols = config.wsIndexerChainIds.reduce(
    (acc, chainId) => {
      acc[chainId] = [];
      return acc;
    },
    {} as Record<
      number,
      SupportedProtocols<
        DataSource,
        IndexerEventPayload,
        EventArgs,
        Partial<typeof Entity>,
        ObjectLiteral
      >[]
    >,
  );

  // Add OFT protocol events configuration (with sponsored events)
  if (config.enableOftIndexer) {
    for (const chainId of getSupportOftChainIds()) {
      if (chainProtocols[chainId]) {
        chainProtocols[chainId].push(SPONSORED_OFT_PROTOCOL);
      }
    }
  }

  // Add SpokePool protocol events configuration
  for (const chainId of config.evmSpokePoolChainsEnabled) {
    if (chainProtocols[chainId]) {
      chainProtocols[chainId].push(SPOKE_POOL_PROTOCOL);
    }
  }

  // Add CCTP protocol events configuration
  for (const chainId of config.cctpIndexerChainIds) {
    if (chainProtocols[chainId]) {
      chainProtocols[chainId].push(SPONSORED_CCTP_PROTOCOL);
    }
  }

  return chainProtocols;
};
