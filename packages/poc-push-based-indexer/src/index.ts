/**
 * @file This is the main entry point for the push-based indexer application.
 *
 * This file is responsible for:
 * - Initializing the core infrastructure components (Message Queue, Database).
 * - Defining the concrete configurations for the indexers we want to run.
 * - Assembling and starting the generic `IndexerSubsystem` with those configurations.
 * - Handling the overall application lifecycle, including graceful shutdown.
 */

import { CHAIN_IDs } from "@across-protocol/constants";
import { IndexerEventPayload } from "./listening/genericEventListener";
import { UNI_TOKEN_ADDRESS } from "./config/constants";
import { ERC20_TRANSFER_ABI } from "./config/events";
import { AsyncQueue } from "./utils/utils";
import { InMemoryDatabase } from "./data/database";
import {
  startIndexerSubsystem,
  IndexerConfig,
} from "./indexing/genericIndexer";
import { Storer } from "./processing/genericEventProcessor";
import { UniTransfer } from "./data/entities";
import { transformToUniTransferEntity } from "./processing/transformations";

// --- Infrastructure Initialization ---
// For this PoC, we use simple in-memory simulations. In production, these
// would be connections to a real MessageBroker and PostgreSQL instance.
const messageQueue = new AsyncQueue<IndexerEventPayload>();
const db = new InMemoryDatabase();

/**
 * Sets up and starts the indexer for UNI token `Transfer` events on Ethereum Mainnet.
 *
 * This function demonstrates how the generic components are assembled into a concrete
 * indexer. To support a new event, one would create a similar function with its
 * own configuration, transformation, and storage logic.
 *
 * @returns A promise that resolves with the running indexer subsystem instance.
 */
async function startEthereumMainnetIndexer() {
  // Concrete Configuration
  // Define the specific parameters for the Ethereum Mainnet UNI Transfer indexer.
  const ethConfig: IndexerConfig = {
    chainId: CHAIN_IDs.MAINNET,
    rpcUrl: process.env.RPC_URL || "wss://ethereum-rpc.publicnode.com",
    // We'll run 3 concurrent workers to process events.
    events: [
      {
        workerCount: 3,
        config: {
          address: UNI_TOKEN_ADDRESS,
          abi: ERC20_TRANSFER_ABI,
          eventName: "Transfer",
        },
      },
    ],
  };

  // Concrete Dependencies for the Generic System
  // Define the specific "store" function for UniTransfer events.
  const storeFactory = (
    workerId: number,
  ): Storer<UniTransfer, InMemoryDatabase> => {
    // This inner function is the actual `Storer` that will be used by a processor.
    return async (entity, database) => {
      // It calls the specific `insertTransfer` method on our database client.
      await database.insertTransfer(entity, workerId);
    };
  };

  // Assembly and Startup
  // Start the generic indexer subsystem with our concrete configuration and functions.
  const indexer = await startIndexerSubsystem(
    db,
    messageQueue,
    ethConfig,
    transformToUniTransferEntity, // The specific transformation function
    storeFactory, // The factory for the specific storage function
  );
  return indexer;
}

/**
 * The main application function.
 * It initializes the system, starts the indexer(s), and handles graceful shutdown.
 */
async function main() {
  console.log("🚀 Starting Push-Based Indexer System...");

  // Start the specific indexer subsystem we defined.
  // We could start multiple different indexers here (e.g., for different chains or events).
  const indexer = await startEthereumMainnetIndexer();

  // Graceful Shutdown Handling
  const shutdown = () => {
    console.log("\n🛑 Gracefully shutting down service...");
    indexer.provider.destroy();
    process.exit(0);
  };

  // Listen for termination signals.
  process.on("SIGINT", shutdown); // Ctrl+C
  process.on("SIGTERM", shutdown); // `kill` command

  console.log("\n✅ System is running. Listening for events...");

  try {
    // Keep the main process alive by awaiting the worker pool.
    // In a real scenario, the workers run indefinitely, so this promise never resolves.
    // It would only reject if a critical, unhandled error occurs in the worker pool setup.
    await indexer.workerPool;
  } catch (error) {
    console.error("❌ A critical error occurred in the worker pool:", error);
    shutdown();
  }
}

main().catch((err) => {
  console.error("❌ A fatal, unhandled error occurred during startup:", err);
  process.exit(1);
});
