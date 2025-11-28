import { IndexerConfig, startIndexerSubsystem } from "./genericIndexer";
import { CHAIN_IDs } from "@across-protocol/constants";
import { IndexerEventPayload } from "./genericEventListener";
import { Entity } from "typeorm";
import {
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  DEPOSIT_FOR_BURN_EVENT_NAME,
} from "./constants";
import { CCTP_DEPOSIT_FOR_BURN_ABI } from "../model/abis";
import { depositForBurnTransformer } from "./transformers";
import { storeDepositForBurnEvent } from "./storer";
import { BlockchainEventRepository } from "../../../../indexer-database/src/utils";
import { Logger } from "winston";

/**
 * Definition of the request object for starting the Arbitrum Mainnet Indexer.
 */
export interface StartArbitrumMainnetIndexerRequest {
  repo: BlockchainEventRepository;
  rpcUrl: string;
  logger: Logger;
  /** Optional signal to gracefully shut down the indexer */
  sigterm?: AbortSignal;
}

/**
 * Sets up and starts the indexer for events on Arbitrum Mainnet.
 *
 * This function demonstrates how the generic components are assembled into a concrete
 * indexer. To support a new event, one would need to add another event to the events array with its
 * own configuration, transformation, and storage logic.
 * * @param request The configuration object containing repo, rpcUrl, logger, and shutdown signal.
 */
export async function startArbitrumMainnetIndexer(
  request: StartArbitrumMainnetIndexerRequest,
) {
  // Destructure the request object
  const { repo, rpcUrl, logger, sigterm } = request;
  // Concrete Configuration
  // Define the specific parameters for the Arbitrum Mainnet indexer.
  const ethConfig: IndexerConfig<
    Partial<typeof Entity>,
    BlockchainEventRepository,
    IndexerEventPayload
  > = {
    chainId: CHAIN_IDs.ARBITRUM,
    rpcUrl,
    events: [
      {
        config: {
          address: TOKEN_MESSENGER_ADDRESS_MAINNET,
          abi: CCTP_DEPOSIT_FOR_BURN_ABI,
          eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
        },
        transform: depositForBurnTransformer, // The specific transformation function for DepositForBurn events
        store: storeDepositForBurnEvent, // The specific storage function for DepositForBurn events
      },
    ],
  };

  // Assembly and Startup
  // Start the generic indexer subsystem with our concrete configuration and functions.
  await startIndexerSubsystem({
    db: repo,
    indexerConfig: ethConfig,
    logger,
    sigterm,
  });
}
