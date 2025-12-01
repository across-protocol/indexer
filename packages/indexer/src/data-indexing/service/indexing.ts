import { IndexerConfig, startIndexing } from "./genericIndexing";
import { CHAIN_IDs } from "@across-protocol/constants";
import { IndexerEventPayload } from "./genericEventListening";
import { Entity } from "typeorm";
import {
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_SENT_EVENT_NAME,
  OFTSENT_EVENT_NAME,
  MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
  TOKEN_MESSENGER_ADDRESS_TESTNET,
  MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
} from "./constants";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  MESSAGE_SENT_ABI,
  OFT_SENT_ABI,
} from "../model/abis";
import {
  storeDepositForBurnEvent,
  storeMessageSentEvent,
  storeOftSentEvent,
} from "./storing";
import {
  transformDepositForBurnEvent,
  transformMessageSentEvent,
  transformOftSentEvent,
} from "./tranforming";
import { utils as dbUtils } from "@repo/indexer-database";
import { Logger } from "winston";
import { getOftChainConfiguration } from "../adapter/oft/service";

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
 * Sets up and starts the indexer for events on Arbitrum.
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
  // Define the specific parameters for the Arbitrum indexer.
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
          abi: MESSAGE_SENT_ABI,
          eventName: MESSAGE_SENT_EVENT_NAME,
        },
        transform: transformMessageSentEvent,
        store: storeMessageSentEvent,
      },
    ],
  };

  // Assembly and Startup
  // Start the generic indexer subsystem with our concrete configuration and functions.
  await startIndexing({
    db: repo,
    indexerConfig: indexerConfig,
    logger,
    sigterm,
  });
}

/**
 * Sets up and starts the indexer for OFT events on hyperEVM.
 * @param request The configuration object containing repo, rpcUrl, logger, and shutdown signal.
 */
export async function startHyperEvmIndexing(request: StartIndexerRequest) {
  const { repo, rpcUrl, logger, sigterm, testNet } = request;
  const chainId = testNet ? CHAIN_IDs.HYPEREVM_TESTNET : CHAIN_IDs.HYPEREVM;
  const oftChainConfig = getOftChainConfiguration(chainId);
  if (!oftChainConfig) {
    throw new Error(`OFT configuration not found for chainId: ${chainId}`);
  }

  const indexerConfig: IndexerConfig<
    Partial<typeof Entity>,
    dbUtils.BlockchainEventRepository,
    IndexerEventPayload
  > = {
    chainId,
    rpcUrl,
    events: oftChainConfig.tokens.map((token) => ({
      config: {
        address: token.address as `0x${string}`,
        abi: OFT_SENT_ABI,
        eventName: OFTSENT_EVENT_NAME,
        fromBlock: token.startBlockNumber,
      },
      transform: transformOftSentEvent,
      store: storeOftSentEvent,
    })),
  };

  await startIndexing({
    db: repo,
    indexerConfig: indexerConfig,
    logger,
    sigterm,
  });
}
