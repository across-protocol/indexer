import { getDeployedBlockNumber } from "@across-protocol/contracts";
import winston from "winston";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { DataSource, entities } from "@repo/indexer-database";
import { differenceWith, isEqual } from "lodash";

import { RedisCache } from "../redis/redisCache";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { RangeQueryStore, Ranges } from "../redis/rangeQueryStore";
import * as utils from "../utils";
import { BaseIndexer } from "../generics";
import { providers } from "ethers";
import { Processor } from "./spokePoolProcessor";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { getMaxBlockLookBack } from "../web3/constants";

export type Config = {
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  hubChainId: number;
  spokePoolChainId: number;
  retryProviderFactory: RetryProvidersFactory;
  configStoreFactory: utils.ConfigStoreClientFactory;
  hubPoolFactory: utils.HubPoolClientFactory;
  spokePoolClientFactory: utils.SpokePoolClientFactory;
};

export class Indexer extends BaseIndexer {
  private resolvedRangeStore: RangeQueryStore;
  private hubPoolClient: across.clients.HubPoolClient;
  private spokePoolClientRepository: SpokePoolRepository;
  private spokePoolProcessor: Processor;
  private spokePoolProvider: providers.Provider;
  private configStoreClient: across.clients.AcrossConfigStoreClient;

  constructor(private readonly config: Config) {
    super(config.logger, "spokePool");
  }

  protected async initialize(): Promise<void> {
    const {
      logger,
      redis,
      postgres,
      retryProviderFactory,
      hubChainId,
      spokePoolChainId,
      hubPoolFactory,
      configStoreFactory,
    } = this.config;
    // Instantiate redis store
    this.resolvedRangeStore = new RangeQueryStore({
      redis,
      prefix: `spokePoolIndexer:${spokePoolChainId}:rangeQuery:resolved`,
    });
    // Instantiate providers
    this.spokePoolProvider =
      retryProviderFactory.getProviderForChainId(spokePoolChainId);
    // Instantiate respositories
    this.spokePoolClientRepository = new SpokePoolRepository(
      postgres,
      logger,
      true,
    );
    // Instantiate processors
    this.spokePoolProcessor = new Processor(postgres, logger, spokePoolChainId);
    // Instantiate clients
    this.configStoreClient = configStoreFactory.get(hubChainId);
    this.hubPoolClient = hubPoolFactory.get(hubChainId, undefined, undefined, {
      configStoreClient: this.configStoreClient,
    });
  }

  protected async indexerLogic(): Promise<void> {
    const allPendingQueries = await this.getUnprocessedRanges();
    this.logger.info({
      message: `Running indexer on ${allPendingQueries.length} block range requests`,
    });
    for (const query of allPendingQueries) {
      if (this.stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        this.logger.info({
          message: `Starting update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
        const events = await this.fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        const storedEvents = await this.storeEvents(events);
        await this.spokePoolProcessor.process(storedEvents);
        await this.resolvedRangeStore.setByRange(fromBlock, toBlock);
        this.logger.info({
          message: `Completed update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error({
            message: `Error updating for block range ${fromBlock} to ${toBlock}`,
            query,
            errorMessage: error.message,
          });
        } else {
          // not an error type, throw it and crash app likely
          throw error;
        }
      }
    }
  }

  private async storeEvents(params: {
    v3FundsDepositedEvents: (across.interfaces.DepositWithBlock & {
      integratorId: string | undefined;
    })[];
    filledV3RelayEvents: across.interfaces.FillWithBlock[];
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: number]: across.interfaces.SpeedUpWithBlock[];
      };
    };
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[];
    tokensBridgedEvents: across.interfaces.TokensBridged[];
  }) {
    const { spokePoolClientRepository } = this;
    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    } = params;
    const savedV3FundsDepositedEvents =
      await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
      );
    const savedV3RequestedSlowFills =
      await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
      );
    const savedFilledV3RelayEvents =
      await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
      );
    const savedExecutedRelayerRefundRootEvents =
      await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
      );
    await spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
      requestedSpeedUpV3Events,
    );
    await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
      relayedRootBundleEvents,
      this.config.spokePoolChainId,
    );
    await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
      tokensBridgedEvents,
    );
    return {
      deposits: savedV3FundsDepositedEvents,
      fills: savedFilledV3RelayEvents,
      slowFillRequests: savedV3RequestedSlowFills,
      executedRefundRoots: savedExecutedRelayerRefundRootEvents,
    };
  }

  private async getUnprocessedRanges(toBlock?: number): Promise<Ranges> {
    const deployedBlockNumber = getDeployedBlockNumber(
      "SpokePool",
      this.config.spokePoolChainId,
    );
    const spokeLatestBlockNumber =
      toBlock ?? (await this.spokePoolProvider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: spokeLatestBlockNumber,
      maxBlockLookBack: getMaxBlockLookBack(this.config.spokePoolChainId),
    });

    const allQueries = await this.resolvedRangeStore.entries();
    const resolvedRanges = allQueries.map(([, x]) => [x.fromBlock, x.toBlock]);
    const needsProcessing = differenceWith(
      allPaginatedBlockRanges,
      resolvedRanges,
      isEqual,
    );

    this.logger.info({
      message: `${needsProcessing.length} block ranges need processing`,
      deployedBlockNumber,
      spokeLatestBlockNumber,
    });

    return needsProcessing;
  }

  private async fetchEventsByRange(fromBlock: number, toBlock: number) {
    this.logger.info({
      message: "updating config store client",
      fromBlock,
      toBlock,
    });
    await this.configStoreClient.update();
    this.logger.info({
      message: "updated config store client",
      fromBlock,
      toBlock,
    });

    this.logger.info({
      message: "updating hubpool client",
      fromBlock,
      toBlock,
    });
    await this.hubPoolClient.update();
    this.logger.info({
      message: "updated hubpool client",
      fromBlock,
      toBlock,
    });

    const spokeClient = this.config.spokePoolClientFactory.get(
      this.config.spokePoolChainId,
      fromBlock,
      toBlock,
      {
        hubPoolClient: this.hubPoolClient,
      },
    );

    this.logger.info({
      message: "updating spokepool client",
      fromBlock,
      toBlock,
    });
    await spokeClient.update();
    this.logger.info({
      message: "updated spokepool client",
      fromBlock,
      toBlock,
    });

    const v3FundsDepositedEvents = spokeClient.getDeposits();
    const v3FundsDepositedWithIntegradorId = await Promise.all(
      v3FundsDepositedEvents.map(async (deposit) => {
        return {
          ...deposit,
          integratorId: await this.getIntegratorId(deposit),
        };
      }),
    );
    const filledV3RelayEvents = spokeClient.getFills();
    const requestedV3SlowFillEvents =
      spokeClient.getSlowFillRequestsForOriginChain(
        this.config.spokePoolChainId,
      );
    const requestedSpeedUpV3Events = spokeClient.getSpeedUps();
    const relayedRootBundleEvents = spokeClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokeClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokeClient.getTokensBridged();

    return {
      v3FundsDepositedEvents: v3FundsDepositedWithIntegradorId,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }

  private async getIntegratorId(deposit: across.interfaces.DepositWithBlock) {
    const INTEGRATOR_DELIMITER = "1dc0de";
    const INTEGRATOR_ID_LENGTH = 4; // Integrator ids are 4 characters long
    let integratorId = undefined;
    const txn = await this.spokePoolProvider.getTransaction(
      deposit.transactionHash,
    );
    const txnData = txn.data;
    if (txnData.includes(INTEGRATOR_DELIMITER)) {
      integratorId = txnData
        .split(INTEGRATOR_DELIMITER)
        .pop()
        ?.substring(0, INTEGRATOR_ID_LENGTH);
    }
    return integratorId;
  }
}
