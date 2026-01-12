import { Logger } from "winston";
import { DataSource } from "@repo/indexer-database";
import { Config } from "../../parseEnv";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
import { HyperliquidIndexer } from "./Indexer";
import { HyperliquidIndexerDataHandler } from "./HyperliquidIndexerDataHandler";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";

export class HyperliquidIndexerManager {
  private indexer?: HyperliquidIndexer;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private rpcUrl: string,
    private startBlockNumber: number = 0,
  ) {}

  public async start() {
    try {
      if (!this.config.enableHyperliquidIndexer) {
        this.logger.warn({
          at: "Indexer#HyperliquidIndexerManager#start",
          message: "Hyperliquid indexer is disabled",
        });
        return;
      }

      if (!this.rpcUrl) {
        this.logger.error({
          at: "Indexer#HyperliquidIndexerManager#start",
          message: "Hyperliquid RPC URL is not configured",
        });
        return;
      }

      const hyperliquidRepository = new HyperliquidRepository(
        this.postgres,
        this.logger,
      );

      const hyperliquidIndexerDataHandler = new HyperliquidIndexerDataHandler(
        this.logger,
        this.rpcUrl,
        hyperliquidRepository,
        this.startBlockNumber,
      );

      // Use a default chain ID for Hyperliquid (we'll need to define this)
      // For now, we'll use a placeholder or get it from config
      const chainId = 998; // Placeholder - adjust based on actual Hyperliquid chain ID

      // Get indexing delay, with fallback if chain ID not in constants
      let indexingDelaySeconds = 4; // Default delay
      try {
        indexingDelaySeconds =
          getIndexingDelaySeconds(chainId, this.config) * 2;
      } catch (error) {
        // Chain ID not in constants, use default
        indexingDelaySeconds = this.config.indexingDelaySeconds ?? 4;
      }

      const indexer = new HyperliquidIndexer(
        {
          indexingDelaySeconds,
          finalisedBlockBufferDistance: 10, // Conservative buffer for Hyperliquid
          maxBlockRangeSize: this.config.maxBlockRangeSize ?? 1000, // Smaller batches for API limits
          indexingDelaySecondsOnError: this.config.indexingDelaySecondsOnError,
        },
        hyperliquidIndexerDataHandler,
        this.logger,
        this.postgres,
        this.rpcUrl,
      );

      this.indexer = indexer;
      this.logger.info({
        at: "Indexer#HyperliquidIndexerManager#start",
        message: "Starting Hyperliquid indexer",
        rpcUrl: this.rpcUrl,
        startBlockNumber: this.startBlockNumber,
      });

      return indexer.start();
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

  public async stopGracefully() {
    this.indexer?.stopGracefully();
  }
}
