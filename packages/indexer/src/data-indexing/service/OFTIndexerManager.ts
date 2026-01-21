import * as across from "@across-protocol/sdk";
import { Logger } from "winston";

import { DataSource } from "@repo/indexer-database";

import { OftRepository } from "../../database/OftRepository";
import { Config } from "../../parseEnv";
import { getMaxBlockLookBack } from "../../web3/constants";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { getSupportOftChainIds } from "../adapter/oft/service";
import {
  getFinalisedBlockBufferDistance,
  getPollingIndexingDelaySeconds,
} from "./constants";
import { EvmIndexer, Indexer } from "./Indexer";
import { OFTIndexerDataHandler } from "./OFTIndexerDataHandler";

export class OFTIndexerManager {
  private indexers: Indexer[] = [];

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private oftRepository: OftRepository,
  ) {}

  public async start() {
    try {
      if (!this.config.enableOftIndexer) {
        this.logger.warn({
          at: "Indexer#OFTIndexerManager#start",
          message: "OFT indexer is disabled",
        });
        return;
      }

      return this.startEvmIndexer();
    } catch (error) {
      this.logger.error({
        at: "Indexer#OFTIndexerManager#start",
        message: "Error starting OFT indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  public async stopGracefully() {
    this.indexers.map((indexer) => indexer.stopGracefully());
  }

  private async startEvmIndexer() {
    const indexers = getSupportOftChainIds().map((chainId) => {
      const provider = this.retryProvidersFactory.getCustomEvmProvider({
        chainId: Number(chainId),
        enableCaching: false,
      }) as across.providers.RetryProvider;
      const oftIndexerDataHandler = new OFTIndexerDataHandler(
        this.logger,
        Number(chainId),
        provider,
        this.oftRepository,
      );
      const indexer = new EvmIndexer(
        {
          indexingDelaySeconds: getPollingIndexingDelaySeconds(this.config),
          finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(
            Number(chainId),
          ),
          maxBlockRangeSize: getMaxBlockLookBack(Number(chainId)),
        },
        oftIndexerDataHandler,
        this.logger,
        this.postgres,
        provider,
      );
      return indexer;
    });

    if (indexers.length === 0) {
      this.logger.warn({
        at: "Indexer#OFTIndexerManager#startEvmIndexer",
        message: "No EVM OFT indexers to start",
      });
      return;
    }

    this.logger.debug({
      at: "Indexer#OFTIndexerManager#startEvmIndexer",
      message: "Starting EVM OFT indexers",
    });
    await Promise.all(indexers.map((indexer) => indexer.start()));
    this.indexers = indexers;

    return Promise.resolve();
  }
}
