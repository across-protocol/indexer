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
import { IndexerQueues, IndexerQueuesService } from "../messaging/service";
import { RelayHashInfoMessage } from "../messaging/RelayHashInfoWorker";

type Config = {
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  indexerQueuesService: IndexerQueuesService;
  retryProviderConfig: utils.RetryProviderConfig;
  configStoreConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  hubConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  spokeConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  redisKeyPrefix: string;
};
export async function SpokePoolIndexer(config: Config) {
  const {
    logger,
    redis,
    postgres,
    indexerQueuesService,
    retryProviderConfig,
    redisKeyPrefix,
    hubConfig,
    spokeConfig,
    configStoreConfig,
  } = config;

  let stopRequested = false;

  function makeId(...args: Array<string | number>) {
    return [redisKeyPrefix, ...args].join(":");
  }

  const resolvedRangeStore = new RangeQueryStore({
    redis,
    prefix: makeId("rangeQuery", "resolved"),
  });

  const redisCache = new RedisCache(redis);
  const hubPoolProvider = utils.getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...hubConfig,
  });
  const configStoreProvider = utils.getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...configStoreConfig,
  });
  const spokePoolProvider = utils.getRetryProvider({
    ...retryProviderConfig,
    cache: redisCache,
    logger,
    ...spokeConfig,
  });

  const spokePoolClientRepository = new SpokePoolRepository(
    postgres,
    logger,
    true,
  );

  const configStoreClient = await utils.getConfigStoreClient({
    logger,
    provider: configStoreProvider,
    maxBlockLookBack: configStoreConfig.maxBlockLookBack,
    chainId: configStoreConfig.chainId,
  });
  const hubPoolClient = await utils.getHubPoolClient({
    configStoreClient,
    provider: hubPoolProvider,
    logger,
    maxBlockLookBack: hubConfig.maxBlockLookBack,
    chainId: hubConfig.chainId,
  });

  async function update() {
    const allPendingQueries = await getUnprocessedRanges();
    logger.info({
      message: `Running indexer on ${allPendingQueries.length} block range requests`,
    });
    for (const query of allPendingQueries) {
      if (stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        logger.info({
          message: `Starting update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
        const events = await fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await storeEvents(events);

        await resolvedRangeStore.setByRange(fromBlock, toBlock);
        logger.info({
          message: `Completed update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          logger.error({
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
  async function getUnprocessedRanges(toBlock?: number): Promise<Ranges> {
    const deployedBlockNumber = getDeployedBlockNumber(
      "SpokePool",
      spokeConfig.chainId,
    );
    const spokeLatestBlockNumber =
      toBlock ?? (await spokePoolProvider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: spokeLatestBlockNumber,
      maxBlockLookBack: spokeConfig.maxBlockLookBack,
    });

    const allQueries = await resolvedRangeStore.entries();
    const resolvedRanges = allQueries.map(([, x]) => [x.fromBlock, x.toBlock]);
    const needsProcessing = differenceWith(
      allPaginatedBlockRanges,
      resolvedRanges,
      isEqual,
    );

    logger.info({
      message: `${needsProcessing.length} block ranges need processing`,
      deployedBlockNumber,
      spokeLatestBlockNumber,
    });

    return needsProcessing;
  }

  async function fetchEventsByRange(fromBlock: number, toBlock: number) {
    logger.info({
      message: "updating config store client",
      fromBlock,
      toBlock,
    });
    await configStoreClient.update();
    logger.info({
      message: "updated config store client",
      fromBlock,
      toBlock,
    });

    logger.info({
      message: "updating hubpool client",
      fromBlock,
      toBlock,
    });
    await hubPoolClient.update();
    logger.info({
      message: "updated hubpool client",
      fromBlock,
      toBlock,
    });

    const spokeClient = await utils.getSpokeClient({
      hubPoolClient,
      provider: spokePoolProvider,
      logger,
      maxBlockLookBack: spokeConfig.maxBlockLookBack,
      chainId: spokeConfig.chainId,
      fromBlock,
      toBlock,
    });

    logger.info({
      message: "updating spokepool client",
      fromBlock,
      toBlock,
    });
    await spokeClient.update();
    logger.info({
      message: "updated spokepool client",
      fromBlock,
      toBlock,
    });

    const v3FundsDepositedEvents = spokeClient.getDeposits();
    const filledV3RelayEvents = spokeClient.getFills();
    const requestedV3SlowFillEvents =
      spokeClient.getSlowFillRequestsForOriginChain(spokeConfig.chainId);
    const requestedSpeedUpV3Events = spokeClient.getSpeedUps();
    const relayedRootBundleEvents = spokeClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokeClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokeClient.getTokensBridged();

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }

  async function publishRelayHashInfoMessages(
    events:
      | entities.V3FundsDeposited[]
      | entities.FilledV3Relay[]
      | entities.RequestedV3SlowFill[],
    eventType: "V3FundsDeposited" | "FilledV3Relay" | "RequestedV3SlowFill",
  ) {
    const messages: RelayHashInfoMessage[] = events.map((event) => {
      return {
        relayHash: event.relayHash,
        eventType,
        eventId: event.id,
        depositId: event.depositId,
        originChainId: event.originChainId,
      };
    });
    await indexerQueuesService.publishMessagesBulk(
      IndexerQueues.RelayHashInfo,
      IndexerQueues.RelayHashInfo, // use queue name as job name
      messages,
    );
  }

  async function storeEvents(params: {
    v3FundsDepositedEvents: across.interfaces.DepositWithBlock[];
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
    await publishRelayHashInfoMessages(
      savedV3FundsDepositedEvents,
      "V3FundsDeposited",
    );

    const savedRequestedV3SlowFillEvents =
      await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
      );
    await publishRelayHashInfoMessages(
      savedRequestedV3SlowFillEvents,
      "RequestedV3SlowFill",
    );

    const savedFilledV3RelayEvents =
      await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
      );
    await publishRelayHashInfoMessages(
      savedFilledV3RelayEvents,
      "FilledV3Relay",
    );

    await spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
      requestedSpeedUpV3Events,
    );
    await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
      relayedRootBundleEvents,
      spokeConfig.chainId,
    );
    await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
      executedRelayerRefundRootEvents,
    );
    await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
      tokensBridgedEvents,
    );
  }

  function stop() {
    stopRequested = true;
  }

  async function start(delay: number) {
    stopRequested = false;
    do {
      await update();
      await across.utils.delay(delay);
    } while (!stopRequested);
  }
  return {
    update,
    start,
    stop,
  };
}
export type SpokePoolIndexer = Awaited<ReturnType<typeof SpokePoolIndexer>>;
