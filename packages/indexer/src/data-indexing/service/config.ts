import { BlockchainEventRepository } from "../../../../indexer-database/dist/src/utils";
import { getSponsoredCCTPDstPeripheryAddress } from "../../utils/contractUtils";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
  CCTP_MESSAGE_SENT_ABI,
  CCTP_MINT_AND_WITHDRAW_ABI,
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
} from "./constants";
import { IndexerEventPayload } from "./genericEventListening";
import { IndexerEventHandler } from "./genericIndexing";
import { Logger } from "winston";
import { extractRawArgs } from "./preprocessing";
import {
  DepositForBurnArgs,
  EventArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  MintAndWithdrawArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
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
  transformMintAndWithdrawEvent,
  transformSwapFlowFinalizedEvent,
  transformSwapFlowInitializedEvent,
} from "./tranforming";
import {
  storeDepositForBurnEvent,
  storeMessageReceivedEvent,
  storeMessageSentEvent,
  storeMintAndWithdrawEvent,
  storeSwapFlowFinalizedEvent,
  storeSwapFlowInitializedEvent,
  storeOFTSentEvent,
  storeOFTReceivedEvent,
} from "./storing";
import { Entity } from "typeorm";
import { CHAIN_IDs, TEST_NETWORKS } from "@across-protocol/constants";
import {
  SWAP_FLOW_FINALIZED_ABI,
  SWAP_FLOW_INITIALIZED_ABI,
  OFT_SENT_ABI,
  OFT_RECEIVED_ABI,
} from "../model/abis";
import {
  OFT_SENT_EVENT_NAME,
  OFT_RECEIVED_EVENT_NAME,
} from "./constants";
import { OFTSentArgs, OFTReceivedArgs } from "../model/eventTypes";
import {
  filterOFTSentEvents,
  filterOFTReceivedEvents,
} from "./filtering";
import {
  transformOFTSentEvent,
  transformOFTReceivedEvent,
} from "./tranforming";
import { getOftChainConfiguration } from "../adapter/oft/service";
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
    logger: Logger,
    chainId: number,
  ) => Array<
    TPreprocessed extends any
      ? IndexerEventHandler<TDb, TPayload, TEventEntity, TPreprocessed>
      : never
  >;
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
  getEventHandlers: (logger: Logger, chainId: number) => {
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
 * Configuration for Sponsored Bridging Protocol.
 */
export const SPONSORED_BRIDGING_PROTOCOL: SupportedProtocols<
  Partial<typeof Entity>,
  BlockchainEventRepository,
  IndexerEventPayload,
  EventArgs
> = {
  getEventHandlers: (logger: Logger, chainId: number) => [
    {
      config: {
        address: getSponsoredCCTPDstPeripheryAddress(chainId) as `0x${string}`,
        abi: SWAP_FLOW_FINALIZED_ABI,
        eventName: "SwapFlowFinalized",
      },
      preprocess: extractRawArgs<SwapFlowFinalizedArgs>,
      filter: async () => true, // No filtering needed
      transform: (args: SwapFlowFinalizedArgs, payload: IndexerEventPayload) =>
        transformSwapFlowFinalizedEvent(args, payload, logger),
      store: storeSwapFlowFinalizedEvent,
    },
    {
      config: {
        address: getSponsoredCCTPDstPeripheryAddress(chainId) as `0x${string}`,
        abi: SWAP_FLOW_INITIALIZED_ABI,
        eventName: "SwapFlowInitialized",
      },
      preprocess: extractRawArgs<SwapFlowInitializedArgs>,
      filter: async () => true, // No filtering needed
      transform: (
        args: SwapFlowInitializedArgs,
        payload: IndexerEventPayload,
      ) => transformSwapFlowInitializedEvent(args, payload, logger),
      store: storeSwapFlowInitializedEvent,
    },
  ],
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
  getEventHandlers: (logger: Logger, chainId: number) => {
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

/**
 * Configuration for supported protocols on different chains.
 * @template Record<number, SupportedProtocols<Partial<typeof Entity>, BlockchainEventRepository, IndexerEventPayload, EventArgs>[]> The type of the supported protocols.
 */
export const CHAIN_PROTOCOLS: Record<
  number,
  SupportedProtocols<
    Partial<typeof Entity>,
    BlockchainEventRepository,
    IndexerEventPayload,
    EventArgs
  >[]
> = {
  [CHAIN_IDs.ARBITRUM]: [CCTP_PROTOCOL, OFT_PROTOCOL],
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: [CCTP_PROTOCOL],
  [CHAIN_IDs.HYPEREVM]: [CCTP_PROTOCOL, SPONSORED_BRIDGING_PROTOCOL],
  [CHAIN_IDs.OPTIMISM]: [CCTP_PROTOCOL],
  [CHAIN_IDs.MAINNET]: [CCTP_PROTOCOL],
  // Add new chains here...
};
