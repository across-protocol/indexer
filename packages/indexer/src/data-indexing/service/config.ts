import {
  getAddress,
  getSponsoredCCTPDstPeripheryAddress,
  getSponsoredCCTPSrcPeripheryAddress,
} from "../../utils/contractUtils";
import { SpokePoolEvents } from "../../utils/spokePoolUtils";
import {
  DataDogMetricsService,
  COUNT,
  withMetrics,
} from "../../services/MetricsService";
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
  FILLED_V3_RELAY_ABI,
  V3_FUNDS_DEPOSITED_ABI,
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
} from "./constants";
import { IndexerEventPayload } from "./genericEventListening";
import { IndexerEventHandler } from "./genericIndexing";
import { Logger } from "winston";
import {
  extractRawArgs,
  preprocessSponsoredDepositForBurn,
  preprocessFilledV3RelayEvent,
  preprocessV3FundsDepositedEvent,
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
} from "../model/eventTypes";
import {
  PreprocessedFilledV3RelayArgs,
  PreprocessedV3FundsDepositedArgs,
  PreprocessedTypes,
} from "../model";

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
} from "./tranforming";
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
} from "./storing";
import { Entity } from "typeorm";
import { TEST_NETWORKS } from "@across-protocol/constants";
import {
  SWAP_FLOW_FINALIZED_ABI,
  SWAP_FLOW_INITIALIZED_ABI,
  OFT_SENT_ABI,
  OFT_RECEIVED_ABI,
} from "../model/abis";
import { OFT_SENT_EVENT_NAME, OFT_RECEIVED_EVENT_NAME } from "./constants";
import { OFTSentArgs, OFTReceivedArgs } from "../model/eventTypes";
import { filterOFTSentEvents, filterOFTReceivedEvents } from "./filtering";
import {
  transformOFTSentEvent,
  transformOFTReceivedEvent,
} from "./tranforming";
import {
  getOftChainConfiguration,
  getSupportOftChainIds,
} from "../adapter/oft/service";
import { Config } from "../../parseEnv";
import { BlockchainEventRepository } from "../../../../indexer-database/dist/src/utils/BlockchainEventRepository";
import { RedisCache } from "../../redis/redisCache";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { initializeContractFactories } from "../../utils";
import { RetryProvider } from "@across-protocol/sdk/dist/cjs/providers/retryProvider";

/**
 * Array of event handlers.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TEventEntity The type of the structured database entity.
 * @template TPreprocessed The type of the preprocessed data.
 */
type EventHandlers<TDb, TPayload, TEventEntity, TPreprocessed> = Array<
  TPreprocessed extends any
    ? IndexerEventHandler<TDb, TPayload, TEventEntity, TPreprocessed>
    : never
>;

/**
 * Request object for getting event handlers.
 * @property logger - The logger instance.
 * @property chainId - The chain ID.
 * @property config - The configuration object.
 */
type GetEventHandlersRequest = {
  logger: Logger;
  chainId: number;
  cache?: RedisCache;
  metrics?: DataDogMetricsService;
};

/**
 * Configuration for a complete indexing subsystem.
 * @template TEventEntity The type of the structured database entity.
 * @template TDb The type of the database client/connection.
 * @template TPayload The type of the event payload from the event listener.
 * @template TPreprocessed The type of the preprocessed data.
 */
export interface SupportedProtocols<
  TEventEntity,
  TDb,
  TPayload,
  TPreprocessed,
> {
  /**
   * Returns the list of event configurations for this protocol.
   * "TPreprocessed extends any" forces TypeScript to distribute the Union.
   * It means: "Allow an array where items can be Handler<Deposit> OR Handler<Message>".
   */
  getEventHandlers: (
    request: GetEventHandlersRequest,
  ) => Promise<EventHandlers<TDb, TPayload, TEventEntity, TPreprocessed>>;
}

/**
 * Configuration for CCTP protocol.
 * @template Partial<typeof Entity> The type of the structured database entity.
 * @template BlockchainEventRepository The type of the database client/connection.
 * @template IndexerEventPayload The type of the event payload from the event listener.
 * @template EventArgs The type of the preprocessed data.
 */
export const CCTP_PROTOCOL: SupportedProtocols<
  Partial<typeof Entity>,
  BlockchainEventRepository,
  IndexerEventPayload,
  EventArgs
> = {
  getEventHandlers: async ({ logger, chainId }: GetEventHandlersRequest) => {
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
        filter: (args: DepositForBurnArgs, payload: IndexerEventPayload) =>
          filterDepositForBurnEvents(args, payload),
        transform: (args: DepositForBurnArgs, payload: IndexerEventPayload) =>
          transformDepositForBurnEvent(args, payload, logger),
        store: storeDepositForBurnEvent,
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
        filter: (_args: MessageSentArgs, payload: IndexerEventPayload) =>
          createCctpBurnFilter(payload, logger),
        transform: (args: MessageSentArgs, payload: IndexerEventPayload) =>
          transformMessageSentEvent(args, payload, logger),
        store: storeMessageSentEvent,
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
        filter: (args: MessageReceivedArgs, payload: IndexerEventPayload) =>
          filterMessageReceived(args, payload, logger),
        transform: (args: MessageReceivedArgs, payload: IndexerEventPayload) =>
          transformMessageReceivedEvent(args, payload, logger),
        store: storeMessageReceivedEvent,
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
        filter: (_args: MintAndWithdrawArgs, payload: IndexerEventPayload) =>
          createCctpMintFilter(payload, logger),
        transform: (args: MintAndWithdrawArgs, payload: IndexerEventPayload) =>
          transformMintAndWithdrawEvent(args, payload, logger),
        store: storeMintAndWithdrawEvent,
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
  BlockchainEventRepository,
  IndexerEventPayload,
  Partial<typeof Entity>,
  EventArgs
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
      transform: (args: SwapFlowFinalizedArgs, payload: IndexerEventPayload) =>
        transformSwapFlowFinalizedEvent(args, payload, logger),
      store: storeSwapFlowFinalizedEvent,
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SWAP_FLOW_INITIALIZED_ABI,
        eventName: SWAP_FLOW_INITIALIZED_EVENT_NAME,
      },
      preprocess: extractRawArgs<SwapFlowInitializedArgs>,
      filter: async () => true,
      transform: (
        args: SwapFlowInitializedArgs,
        payload: IndexerEventPayload,
      ) => transformSwapFlowInitializedEvent(args, payload, logger),
      store: storeSwapFlowInitializedEvent,
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SPONSORED_ACCOUNT_ACTIVATION_ABI,
        eventName: SPONSORED_ACCOUNT_ACTIVATION_EVENT_NAME,
      },
      preprocess: extractRawArgs<SponsoredAccountActivationArgs>,
      filter: async () => true,
      transform: (
        args: SponsoredAccountActivationArgs,
        payload: IndexerEventPayload,
      ) => transformSponsoredAccountActivationEvent(args, payload, logger),
      store: storeSponsoredAccountActivationEvent,
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: SIMPLE_TRANSFER_FLOW_COMPLETED_ABI,
        eventName: SIMPLE_TRANSFER_FLOW_COMPLETED_EVENT_NAME,
      },
      preprocess: extractRawArgs<SimpleTransferFlowCompletedArgs>,
      filter: async () => true,
      transform: (
        args: SimpleTransferFlowCompletedArgs,
        payload: IndexerEventPayload,
      ) => transformSimpleTransferFlowCompletedEvent(args, payload, logger),
      store: storeSimpleTransferFlowCompletedEvent,
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: FALLBACK_HYPER_EVM_FLOW_COMPLETED_ABI,
        eventName: FALLBACK_HYPER_EVM_FLOW_COMPLETED_EVENT_NAME,
      },
      preprocess: extractRawArgs<FallbackHyperEVMFlowCompletedArgs>,
      filter: async () => true,
      transform: (
        args: FallbackHyperEVMFlowCompletedArgs,
        payload: IndexerEventPayload,
      ) => transformFallbackHyperEVMFlowCompletedEvent(args, payload, logger),
      store: storeFallbackHyperEVMFlowCompletedEvent,
    },
    {
      config: {
        address: sponsorshipContractAddress as `0x${string}`,
        abi: ARBITRARY_ACTIONS_EXECUTED_ABI,
        eventName: ARBITRARY_ACTIONS_EXECUTED_EVENT_NAME,
      },
      preprocess: extractRawArgs<ArbitraryActionsExecutedArgs>,
      filter: async () => true,
      transform: (
        args: ArbitraryActionsExecutedArgs,
        payload: IndexerEventPayload,
      ) => transformArbitraryActionsExecutedEvent(args, payload, logger),
      store: storeArbitraryActionsExecutedEvent,
    },
  ];
};

export const SPONSORED_CCTP_PROTOCOL: SupportedProtocols<
  Partial<typeof Entity>,
  BlockchainEventRepository,
  IndexerEventPayload,
  EventArgs
> = {
  getEventHandlers: async ({ logger, chainId }: GetEventHandlersRequest) => {
    // First let's get the regular CCTP handlers
    const handlers = await CCTP_PROTOCOL.getEventHandlers({ logger, chainId });

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
        transform: (
          args: SponsoredDepositForBurnArgs,
          payload: IndexerEventPayload,
        ) => transformSponsoredDepositForBurnEvent(args, payload, logger),
        store: storeSponsoredDepositForBurnEvent,
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
  Partial<typeof Entity>,
  BlockchainEventRepository,
  IndexerEventPayload,
  EventArgs
> = {
  getEventHandlers: async ({ logger, chainId }: GetEventHandlersRequest) => {
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
        filter: (args: OFTSentArgs, payload: IndexerEventPayload) =>
          filterOFTSentEvents(args, payload),
        transform: (args: OFTSentArgs, payload: IndexerEventPayload) =>
          transformOFTSentEvent(args, payload, logger, tokenAddress),
        store: storeOFTSentEvent,
      },
      {
        config: {
          address: adapterAddress as `0x${string}`,
          abi: OFT_RECEIVED_ABI,
          eventName: OFT_RECEIVED_EVENT_NAME,
        },
        preprocess: extractRawArgs<OFTReceivedArgs>,
        filter: (args: OFTReceivedArgs, payload: IndexerEventPayload) =>
          filterOFTReceivedEvents(args, payload),
        transform: (args: OFTReceivedArgs, payload: IndexerEventPayload) =>
          transformOFTReceivedEvent(args, payload, logger, tokenAddress),
        store: storeOFTReceivedEvent,
      },
    ];
  },
};

export const SPOKE_POOL_PROTOCOL: SupportedProtocols<
  any,
  BlockchainEventRepository,
  IndexerEventPayload,
  PreprocessedTypes
> = {
  getEventHandlers: async ({
    logger,
    chainId,
    cache,
    metrics,
  }: GetEventHandlersRequest) => {
    if (!cache) {
      const message = `No cache ${cache} found for chainId for spoke pool protocol${chainId}`;
      logger.error({ message });
      throw new Error(message);
    }
    const retryProvidersFactory = new RetryProvidersFactory(
      cache,
      logger,
    ).initializeProviders();

    // Wrap the provider's send method with metrics
    const originalGetProviderForChainId =
      retryProvidersFactory.getProviderForChainId.bind(retryProvidersFactory);
    retryProvidersFactory.getProviderForChainId = (chainId: number) => {
      const provider = originalGetProviderForChainId(chainId);
      // Check if provider has a send method (RetryProvider) and cast to any to allow modification
      if ("send" in provider && typeof (provider as any).send === "function") {
        const retryProvider = provider as RetryProvider;
        const originalSend = retryProvider.send.bind(retryProvider);
        retryProvider.send = withMetrics(originalSend, {
          service: metrics,
          metricName: "SpokePoolProtocolRpcRequests",
          tags: [`chainId:${chainId}`, `spokePoolProtocol`],
          type: COUNT,
          logger,
        });
      }
      return provider;
    };
    // SDK clients factories
    const contractFactories = initializeContractFactories(
      retryProvidersFactory,
      logger,
    );
    // We want a single cache for all spoke pool events initialized per chain
    // This cache is then passed to the preprocess functions
    const spokePoolEventCache = new Map<string, SpokePoolEvents>();

    return [
      {
        config: {
          abi: FILLED_V3_RELAY_ABI,
          eventName: FILLED_RELAY_V3_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: (payload: IndexerEventPayload) =>
          preprocessFilledV3RelayEvent({
            payload,
            factories: contractFactories,
            logger,
            cache: spokePoolEventCache,
            metrics,
          }),
        filter: async () => true,
        transform: (
          args: PreprocessedFilledV3RelayArgs,
          payload: IndexerEventPayload,
        ) => transformFilledV3RelayEvent(args, payload, logger),
        store: storeFilledV3RelayEvent,
      },
      {
        config: {
          abi: V3_FUNDS_DEPOSITED_ABI,
          eventName: FUNDS_DEPOSITED_V3_EVENT_NAME,
          address: getAddress("SpokePool", chainId) as `0x${string}`,
        },
        preprocess: (payload: IndexerEventPayload) =>
          preprocessV3FundsDepositedEvent({
            payload,
            factories: contractFactories,
            logger,
            cache: spokePoolEventCache,
            metrics,
          }),
        filter: async () => true,
        transform: (
          args: PreprocessedV3FundsDepositedArgs,
          payload: IndexerEventPayload,
        ) => transformV3FundsDepositedEvent(args, payload, logger),
        store: storeV3FundsDepositedEvent,
      },
    ];
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
    Partial<typeof Entity>,
    BlockchainEventRepository,
    IndexerEventPayload,
    PreprocessedTypes | EventArgs
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
        Partial<typeof Entity>,
        BlockchainEventRepository,
        IndexerEventPayload,
        PreprocessedTypes | EventArgs
      >[]
    >,
  );

  // Add OFT protocol events configuration
  if (config.enableOftIndexer) {
    for (const chainId of getSupportOftChainIds()) {
      if (chainProtocols[chainId]) {
        chainProtocols[chainId].push(OFT_PROTOCOL);
      }
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
