import { BlockchainEventRepository } from "../../../../indexer-database/dist/src/utils";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
  CCTP_MESSAGE_SENT_ABI,
} from "../model/abis";
import {
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_RECEIVED_EVENT_NAME,
  MESSAGE_SENT_EVENT_NAME,
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
} from "../model/eventTypes";
import {
  createCctpBurnFilter,
  filterDepositForBurnEvents,
  filterMessageReceived,
} from "./filtering";
import {
  transformDepositForBurnEvent,
  transformMessageReceivedEvent,
  transformMessageSentEvent,
} from "./tranforming";
import {
  storeDepositForBurnEvent,
  storeMessageReceivedEvent,
  storeMessageSentEvent,
} from "./storing";
import { Entity } from "typeorm";
import { CHAIN_IDs } from "@across-protocol/constants";
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
    testNet: boolean,
    logger: Logger,
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
  getEventHandlers: (testNet: boolean, logger: Logger) => [
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
  ],
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
  [CHAIN_IDs.ARBITRUM]: [CCTP_PROTOCOL],
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: [CCTP_PROTOCOL],
  // Add new chains here...
};
