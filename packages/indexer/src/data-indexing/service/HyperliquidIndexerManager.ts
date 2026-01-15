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
import { getIndexingStartBlockNumber } from "../adapter/cctp-v2/service";

export class HyperliquidIndexerManager {
  private indexer?: HyperliquidIndexer;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
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

      // Chain ID is always HYPERCORE (1337) for Hyperliquid
      const chainId = CHAIN_IDs.HYPERCORE;

      // Use different chain ID for mainnet and testnet RPC config
      // Mainnet uses 1337, testnet uses 1338
      const rpcConfigChainId = this.config.hyperliquidMainnet
        ? chainId
        : chainId + 1;
      const rpcUrls = parseProvidersUrls().get(rpcConfigChainId);
      const rpcUrl = rpcUrls?.[0];

      if (!rpcUrl) {
        this.logger.error({
          at: "Indexer#HyperliquidIndexerManager#start",
          message: `Hyperliquid RPC URL is not configured. Please set RPC_PROVIDER_URLS_${rpcConfigChainId} (${this.config.hyperliquidMainnet ? "mainnet" : "testnet"})`,
        });
        return;
      }

      const hyperliquidRepository = new HyperliquidRepository(
        this.postgres,
        this.logger,
      );

      // Get start block number from constant, with env override support
      const startBlockNumber =
        this.config.hyperliquidIndexerStartBlock !== undefined
          ? this.config.hyperliquidIndexerStartBlock
          : getIndexingStartBlockNumber(chainId);

      const hyperliquidIndexerDataHandler = new HyperliquidIndexerDataHandler(
        this.logger,
        rpcUrl,
        hyperliquidRepository,
        startBlockNumber,
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

      this.indexer = indexer;
      this.logger.info({
        at: "Indexer#HyperliquidIndexerManager#start",
        message: "Starting Hyperliquid indexer",
        chainId,
        rpcUrl,
        startBlockNumber,
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
