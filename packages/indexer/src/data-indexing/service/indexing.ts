import { IndexerConfig, startIndexing } from "./genericIndexing";
import { CHAIN_IDs } from "@across-protocol/constants";
import { IndexerEventPayload } from "./genericEventListening";
import { Entity } from "typeorm";
import {
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_SENT_EVENT_NAME,
  MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
  TOKEN_MESSENGER_ADDRESS_TESTNET,
  MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
  MESSAGE_RECEIVED_EVENT_NAME,
} from "./constants";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_SENT_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
} from "../model/abis";
import {
  transformDepositForBurnEvent,
  transformMessageSentEvent,
  transformMessageReceivedEvent,
} from "./tranforming";
import { extractRawArgs } from "./preprocessing";
import {
  storeDepositForBurnEvent,
  storeMessageSentEvent,
  storeMessageReceivedEvent,
} from "./storing";
import { utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";
import {
  filterDepositForBurnEvents,
  createCctpBurnFilter,
  filterMessageReceived,
} from "./filtering";
import {
  EventArgs,
  DepositForBurnArgs,
  MessageSentArgs,
  MessageReceivedArgs,
} from "../model/eventTypes";

/**
 * Definition of the request object for starting an indexer.
 */
export interface StartIndexerRequest {
  repo: dbUtils.BlockchainEventRepository;
  rpcUrl: string;
  logger: Logger;
  /** Optional signal to gracefully shut down the indexer */
  sigterm?: AbortSignal;
  testNet?: boolean;
}

/**
 * Sets up and starts the indexer for events on Arbitrum Mainnet.
 *
 * This function demonstrates how the generic components are assembled into a concrete
 * indexer. To support a new event, one would need to add another event to the events array with its
 * own configuration, transformation, and storage logic.
 * * @param request The configuration object containing repo, rpcUrl, logger, and shutdown signal.
 */
export async function startArbitrumIndexing(request: StartIndexerRequest) {
  // Destructure the request object
  const { repo, rpcUrl, logger, sigterm, testNet } = request;

  // Create a client for filtering logic (fetching transactions)
  // We reuse the WebSocket client factory as it provides a robust Viem client
  // We use the correct chain ID based on testNet flag
  const chainId = testNet ? CHAIN_IDs.ARBITRUM_SEPOLIA : CHAIN_IDs.ARBITRUM;

  // Concrete Configuration
  // Define the specific parameters for the Arbitrum indexer.
  const indexerConfig: IndexerConfig<
    Partial<typeof Entity>,
    dbUtils.BlockchainEventRepository,
    IndexerEventPayload,
    EventArgs
  > = {
    chainId,
    rpcUrl,
    events: [
      {
        config: {
          address: testNet
            ? TOKEN_MESSENGER_ADDRESS_TESTNET
            : TOKEN_MESSENGER_ADDRESS_MAINNET,
          abi: CCTP_DEPOSIT_FOR_BURN_ABI,
          eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
        },
        preprocess: extractRawArgs<DepositForBurnArgs>,
        filter: (args, payload) =>
          filterDepositForBurnEvents(args as DepositForBurnArgs, payload),
        transform: (args, payload) =>
          transformDepositForBurnEvent(
            args as DepositForBurnArgs,
            payload,
            logger,
          ),
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
        filter: (_, payload) => createCctpBurnFilter(payload, logger),
        transform: (args, payload) =>
          transformMessageSentEvent(args as MessageSentArgs, payload, logger),
        store: storeMessageSentEvent,
      },
      {
        config: {
          address: request.testNet
            ? MESSAGE_TRANSMITTER_ADDRESS_TESTNET
            : MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
          abi: CCTP_MESSAGE_RECEIVED_ABI,
          eventName: MESSAGE_RECEIVED_EVENT_NAME,
        },
        preprocess: extractRawArgs<MessageReceivedArgs>,
        filter: (args, payload) =>
          filterMessageReceived(args as MessageReceivedArgs, payload, logger),
        transform: (args, payload) =>
          transformMessageReceivedEvent(
            args as MessageReceivedArgs,
            payload,
            logger,
          ),
        store: storeMessageReceivedEvent,
      },
    ],
  };

  // Assembly and Startup
  // Start the generic indexer subsystem with our concrete configuration and functions.
  await startIndexing({
    db: repo,
    indexerConfig,
    logger,
    sigterm,
  });
}
