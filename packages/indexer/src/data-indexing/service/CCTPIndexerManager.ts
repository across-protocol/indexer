import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";

import { DataSource } from "@repo/indexer-database";

import { Config } from "../../parseEnv";
import {
  getFinalisedBlockBufferDistance,
  getPollingIndexerDelaySeconds,
} from "./constants";
import { EvmIndexer, SvmIndexer } from "./Indexer";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { CCTPIndexerDataHandler } from "./CCTPIndexerDataHandler";
import { SvmCCTPIndexerDataHandler } from "./SvmCCTPIndexerDataHandler";
import { CCTPRepository } from "../../database/CctpRepository";
import { getMaxBlockLookBack } from "../../web3/constants";

export class CCTPIndexerManager {
  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private cctpRepository: CCTPRepository,
  ) {}

  public async start(signal: AbortSignal) {
    try {
      if (this.config.cctpIndexerChainIds.length === 0) {
        this.logger.warn({
          at: "Indexer#CCTPIndexerManager#start",
          message: "CCTP indexer is disabled",
        });
        return;
      }

      return Promise.all([
        this.startEvmIndexer(signal),
        this.startSvmIndexer(signal),
      ]);
    } catch (error) {
      this.logger.error({
        at: "Indexer#CCTPIndexerManager#start",
        message: "Error starting CCTP indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  private async startEvmIndexer(signal: AbortSignal) {
    const evmChains = this.config.cctpIndexerChainIds.filter((chainId) =>
      across.utils.chainIsEvm(chainId),
    );

    const indexers = evmChains.map((chainId) => {
      const provider = this.retryProvidersFactory.getCustomEvmProvider({
        chainId,
        enableCaching: false,
      }) as across.providers.RetryProvider;
      const cctpIndexerDataHandler = new CCTPIndexerDataHandler(
        this.logger,
        chainId,
        provider,
        this.cctpRepository,
      );
      const indexer = new EvmIndexer(
        {
          indexingDelaySeconds: getPollingIndexerDelaySeconds(
            chainId,
            this.config,
          ),
          finalisedBlockBufferDistance:
            getFinalisedBlockBufferDistance(chainId),
          maxBlockRangeSize: getMaxBlockLookBack(chainId),
          indexingDelaySecondsOnError: this.config.indexingDelaySecondsOnError,
        },
        cctpIndexerDataHandler,
        this.logger,
        this.postgres,
        provider,
      );
      return indexer;
    });

    if (indexers.length === 0) {
      this.logger.warn({
        at: "Indexer#CCTPIndexerManager#startEvmIndexer",
        message: "No EVM CCTP indexers to start",
      });
      return;
    }

    this.logger.debug({
      at: "Indexer#CCTPIndexerManager#startEvmIndexer",
      message: "Starting EVM CCTP indexers",
      chainIds: evmChains,
    });
    await Promise.all(indexers.map((indexer) => indexer.start(signal)));
  }

  private async startSvmIndexer(signal: AbortSignal) {
    const svmChains = this.config.cctpIndexerChainIds.filter((chainId) =>
      across.utils.chainIsSvm(chainId),
    );

    const indexers = svmChains.map((chainId) => {
      const provider = this.retryProvidersFactory.getProviderForChainId(
        chainId,
      ) as across.arch.svm.SVMProvider;
      const svmCctpIndexerDataHandler = new SvmCCTPIndexerDataHandler(
        this.logger,
        chainId,
        provider,
        this.cctpRepository,
      );
      const indexer = new SvmIndexer(
        {
          indexingDelaySeconds: getPollingIndexerDelaySeconds(
            chainId,
            this.config,
          ),
          finalisedBlockBufferDistance:
            getFinalisedBlockBufferDistance(chainId),
          maxBlockRangeSize: getMaxBlockLookBack(chainId),
        },
        svmCctpIndexerDataHandler,
        this.logger,
        this.postgres,
        provider,
      );
      return indexer;
    });

    if (indexers.length === 0) {
      this.logger.warn({
        at: "Indexer#CCTPIndexerManager#startSvmIndexer",
        message: "No SVM CCTP indexers to start",
      });
      return;
    }

    this.logger.debug({
      at: "Indexer#CCTPIndexerManager#startSvmIndexer",
      message: "Starting SVM CCTP indexers",
      chainIds: svmChains,
    });
    await Promise.all(indexers.map((indexer) => indexer.start(signal)));
  }
}
