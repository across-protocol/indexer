import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import { DataSource } from "@repo/indexer-database";
import { Config, parseProvidersUrls } from "../../parseEnv";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
import { HyperliquidIndexer } from "./Indexer";
import { HyperliquidIndexerDataHandler } from "./HyperliquidIndexerDataHandler";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";

/**
 * Starting block number for Hyperliquid indexing
 * This represents the block number when Hyperliquid deposits started being indexed
 */
const HYPERLIQUID_STARTING_BLOCK_NUMBER = 863585946;

export class HyperliquidIndexerManager {
  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
  ) {}

  public async start(signal: AbortSignal) {
    try {
      if (!this.config.enableHyperliquidIndexer) {
        this.logger.warn({
          at: "Indexer#HyperliquidIndexerManager#start",
          message: "Hyperliquid indexer is disabled",
        });
        return;
      }

      // Chain ID is always HYPERCORE (1337) for Hyperliquid
      const chainId = CHAIN_IDs.HYPERCORE;

      // Use RPC_PROVIDER_URLS_1337 for Hyperliquid mainnet
      const rpcUrls = parseProvidersUrls().get(chainId);
      const rpcUrl = rpcUrls?.[0];

      if (!rpcUrl) {
        this.logger.error({
          at: "Indexer#HyperliquidIndexerManager#start",
          message: `Hyperliquid RPC URL is not configured. Please set RPC_PROVIDER_URLS_${chainId}`,
        });
        return;
      }

      const hyperliquidRepository = new HyperliquidRepository(
        this.postgres,
        this.logger,
      );

      // Use the starting block number for Hyperliquid mainnet
      const startBlockNumber = HYPERLIQUID_STARTING_BLOCK_NUMBER;

      const hyperliquidIndexerDataHandler = new HyperliquidIndexerDataHandler(
        this.logger,
        rpcUrl,
        hyperliquidRepository,
        startBlockNumber,
        this.postgres,
      );

      let indexingDelaySeconds = 4; // Default delay
      try {
        indexingDelaySeconds =
          getIndexingDelaySeconds(chainId, this.config) * 2;
      } catch (error) {
        indexingDelaySeconds = this.config.indexingDelaySeconds ?? 4;
      }

      const indexer = new HyperliquidIndexer(
        {
          indexingDelaySeconds,
          finalisedBlockBufferDistance: 0, // Reorgs are not possible on Hyperliquid
          maxBlockRangeSize: this.config.maxBlockRangeSize ?? 1000,
          indexingDelaySecondsOnError: this.config.indexingDelaySecondsOnError,
        },
        hyperliquidIndexerDataHandler,
        this.logger,
        this.postgres,
        rpcUrl,
      );

      this.logger.info({
        at: "Indexer#HyperliquidIndexerManager#start",
        message: "Starting Hyperliquid indexer",
        chainId,
        rpcUrl,
        startBlockNumber,
      });

      return indexer.start(signal);
    } catch (error) {
      this.logger.error({
        at: "Indexer#HyperliquidIndexerManager#start",
        message: "Error starting Hyperliquid indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }
}
