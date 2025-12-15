import { IndexerConfig, startIndexing } from "./genericIndexing";
import { CHAIN_IDs, MAINNET_CHAIN_IDs } from "@across-protocol/constants";
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
import {
  storeDepositForBurnEvent,
  storeMessageSentEvent,
  storeMessageReceivedEvent,
} from "./storing";
import { utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";

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
  const { repo, rpcUrl, logger, sigterm } = request;
  // Concrete Configuration
  // Define the specific parameters for the Arbitrum Mainnet indexer.
  const indexerConfig: IndexerConfig<
    Partial<typeof Entity>,
    dbUtils.BlockchainEventRepository,
    IndexerEventPayload
  > = {
    chainId: request.testNet ? CHAIN_IDs.ARBITRUM_SEPOLIA : CHAIN_IDs.ARBITRUM,
    rpcUrl,
    events: [
      {
        config: {
          address: request.testNet
            ? TOKEN_MESSENGER_ADDRESS_TESTNET
            : TOKEN_MESSENGER_ADDRESS_MAINNET,
          abi: CCTP_DEPOSIT_FOR_BURN_ABI,
          eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
        },
        transform: transformDepositForBurnEvent, // The specific transformation function for DepositForBurn events
        store: storeDepositForBurnEvent, // The specific storage function for DepositForBurn events
      },
      {
        config: {
          address: request.testNet
            ? MESSAGE_TRANSMITTER_ADDRESS_TESTNET
            : MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
          abi: CCTP_MESSAGE_SENT_ABI,
          eventName: MESSAGE_SENT_EVENT_NAME,
        },
        transform: transformMessageSentEvent,
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
        transform: transformMessageReceivedEvent,
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
