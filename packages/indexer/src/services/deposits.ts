import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";
import { getRelayHashFromEvent } from "@across-protocol/sdk/dist/cjs/utils/SpokeUtils";
import winston from "winston";
import Redis from "ioredis";
import {
  DataSource,
  Deposit,
  Fill,
  SlowFillRequest,
} from "@repo/indexer-database";

import { providers, Contract } from "ethers";

// from https://github.com/across-protocol/relayer/blob/master/src/common/Constants.ts#L30
export const CONFIG_STORE_VERSION = 4;

type GetSpokeClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
  hubPoolClient: across.clients.HubPoolClient;
};
export async function getSpokeClient(
  params: GetSpokeClientParams,
): Promise<across.clients.SpokePoolClient> {
  const { provider, logger, redis, maxBlockLookBack, chainId, hubPoolClient } =
    params;
  const address = getDeployedAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const latestBlockNumber = await provider.getBlockNumber();
  // for testing
  // let lastProcessedBlockNumber: number = latestBlockNumber - 10000;

  // need persistence for this, use it to resume query
  let lastProcessedBlockNumber: number = deployedBlockNumber;
  if (redis) {
    lastProcessedBlockNumber = Number(
      (await redis.get(getLastBlockSearchedKey("spokePool", chainId))) ??
        lastProcessedBlockNumber,
    );
  }
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  logger.info({
    message: "creating spoke client for deposit indexer",
    chainId,
    address,
    deployedBlockNumber,
    latestBlockNumber,
    eventSearchConfig,
    blocksBehind: latestBlockNumber - lastProcessedBlockNumber,
    usingRedis: !!redis,
  });
  const spokePoolContract = new Contract(
    address,
    SpokePoolFactory.abi,
    provider,
  );
  return new across.clients.SpokePoolClient(
    logger,
    spokePoolContract,
    hubPoolClient,
    chainId,
    deployedBlockNumber,
    eventSearchConfig,
  );
}
type GetConfigStoreClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
};
export async function getConfigStoreClient(params: GetConfigStoreClientParams) {
  const { provider, logger, redis, maxBlockLookBack, chainId } = params;
  const address = getDeployedAddress("AcrossConfigStore", chainId);
  const deployedBlockNumber = getDeployedBlockNumber(
    "AcrossConfigStore",
    chainId,
  );
  const configStoreContract = new Contract(
    address,
    AcrossConfigStoreFactory.abi,
    provider,
  );
  let lastProcessedBlockNumber: number = deployedBlockNumber;
  // for now we will always process all config store events.
  // if (redis) {
  //   lastProcessedBlockNumber = Number(
  //     (await redis.get(getLastBlockSearchedKey('configStore',chainId))) ??
  //       lastProcessedBlockNumber,
  //   );
  // }
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  return new across.clients.AcrossConfigStoreClient(
    logger,
    configStoreContract,
    eventSearchConfig,
    CONFIG_STORE_VERSION,
  );
}
type GetHubPoolClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
  configStoreClient: across.clients.AcrossConfigStoreClient;
};
export async function getHubPoolClient(params: GetHubPoolClientParams) {
  const {
    provider,
    logger,
    redis,
    maxBlockLookBack,
    chainId,
    configStoreClient,
  } = params;
  const address = getDeployedAddress("HubPool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("HubPool", chainId);

  const hubPoolContract = new Contract(address, HubPoolFactory.abi, provider);
  let lastProcessedBlockNumber: number = deployedBlockNumber;
  if (redis) {
    lastProcessedBlockNumber = Number(
      (await redis.get(getLastBlockSearchedKey("hubPool", chainId))) ??
        lastProcessedBlockNumber,
    );
  }
  const eventSearchConfig = {
    fromBlock: lastProcessedBlockNumber,
    maxBlockLookBack,
  };
  return new across.clients.HubPoolClient(
    logger,
    hubPoolContract,
    configStoreClient,
    deployedBlockNumber,
    chainId,
    eventSearchConfig,
  );
}
function getLastBlockSearchedKey(
  clientName: "hubPool" | "spokePool" | "configStore",
  chainId: number,
): string {
  return [
    "depositIndexer",
    clientName,
    "lastProcessedBlockNumber",
    chainId,
  ].join("~");
}

type Config = {
  spokePoolProviderUrls: string[];
  hubPoolProviderUrl: string;
  maxBlockLookBack?: number;
  logger: winston.Logger;
  redis: Redis | undefined;
  postgres: DataSource | undefined;
};

export async function Indexer(config: Config) {
  const {
    spokePoolProviderUrls,
    hubPoolProviderUrl,
    maxBlockLookBack = 10000,
    logger,
    redis,
    postgres,
  } = config;

  const hubPoolProvider = new providers.JsonRpcProvider(hubPoolProviderUrl);
  const hubPoolNetworkInfo = await hubPoolProvider.getNetwork();

  const configStoreClient = await getConfigStoreClient({
    provider: hubPoolProvider,
    logger,
    redis,
    maxBlockLookBack,
    chainId: hubPoolNetworkInfo.chainId,
  });
  const hubPoolClient = await getHubPoolClient({
    provider: hubPoolProvider,
    logger,
    redis,
    maxBlockLookBack,
    chainId: hubPoolNetworkInfo.chainId,
    configStoreClient,
  });

  const spokeClientEntries: [number, across.clients.SpokePoolClient][] =
    await Promise.all(
      spokePoolProviderUrls.map(async (providerUrl) => {
        const provider = new providers.JsonRpcProvider(providerUrl);
        const networkInfo = await provider.getNetwork();
        const { chainId } = networkInfo;
        return [
          chainId,
          await getSpokeClient({
            provider,
            logger,
            redis,
            maxBlockLookBack,
            chainId,
            hubPoolClient,
          }),
        ];
      }),
    );

  function formatRelayData(
    event:
      | across.interfaces.DepositWithBlock
      | across.interfaces.FillWithBlock
      | across.interfaces.SlowFillRequestWithBlock,
  ) {
    return {
      inputAmount: event.inputAmount.toString(),
      outputAmount: event.outputAmount.toString(),
      fillDeadline: new Date(event.fillDeadline * 1000),
      exclusivityDeadline:
        event.exclusivityDeadline === 0
          ? undefined
          : new Date(event.exclusivityDeadline * 1000),
    };
  }

  async function formatAndSaveDeposits(
    deposits: across.interfaces.DepositWithBlock[],
  ) {
    const depositRepository = postgres?.getRepository(Deposit);
    const formattedDeposits = deposits.map((deposit) => {
      return {
        uuid: getRelayHashFromEvent(deposit),
        ...formatRelayData(deposit),
        quoteTimestamp: new Date(deposit.quoteTimestamp * 1000),
      };
    });
    try {
      await depositRepository?.save(formattedDeposits, { chunk: 2000 });
      logger.info(`Saved ${deposits.length} deposits`);
    } catch (error) {
      logger.error("There was an error while saving deposits:", error);
    }
  }

  async function formatAndSaveFills(fills: across.interfaces.FillWithBlock[]) {
    const fillRepository = postgres?.getRepository(Fill);
    const formattedFills = fills.map((fill) => {
      return {
        uuid: getRelayHashFromEvent(fill),
        ...formatRelayData(fill),
        relayExecutionInfo: {
          ...fill.relayExecutionInfo,
          updatedOutputAmount:
            fill.relayExecutionInfo.updatedOutputAmount.toString(),
        },
      };
    });
    try {
      await fillRepository?.save(formattedFills, { chunk: 2000 });
      logger.info(`Saved ${fills.length} fills`);
    } catch (error) {
      logger.error("There was an error while saving fills:", error);
    }
  }

  async function formatAndSaveSlowFillRequests(
    slowFillRequests: across.interfaces.SlowFillRequestWithBlock[],
  ) {
    const slowFillRequestRepository = postgres?.getRepository(SlowFillRequest);
    const formattedSlowFillRequests = slowFillRequests.map((slowFillReq) => {
      return {
        uuid: getRelayHashFromEvent(slowFillReq),
        ...formatRelayData(slowFillReq),
      };
    });
    try {
      await slowFillRequestRepository?.save(formattedSlowFillRequests, {
        chunk: 2000,
      });
      logger.info(`Saved ${slowFillRequests.length} slow fill requests`);
    } catch (error) {
      logger.error(
        "There was an error while saving slow fill requests:",
        error,
      );
    }
  }

  async function updateHubPool(now: number, chainId: number) {
    logger.info("Starting hub pool client update");
    await hubPoolClient.update();
    // TODO: store any data we need for hubpool in index
    const latestBlockSearched = hubPoolClient.latestBlockSearched;
    logger.info({
      message: "Finished updating hub pool client",
      chainId,
      latestBlockSearched,
    });
    if (redis) {
      await redis.set(
        getLastBlockSearchedKey("hubPool", chainId),
        latestBlockSearched,
      );
    }
  }
  async function updateConfigStore(now: number, chainId: number) {
    logger.info("Starting config store update");
    await configStoreClient.update();
    // TODO: store any data we need for configs in index
    const latestBlockSearched = configStoreClient.latestBlockSearched;
    logger.info({
      message: "Finished updating config store client",
      chainId,
      latestBlockSearched,
    });
    // remove this for now
    // if (redis) {
    //   await redis.set(
    //     getConfigStoreLastBlockSearchedKey(chainId),
    //     latestBlockSearched,
    //   );
    // }
  }
  async function updateSpokePool(
    now: number,
    chainId: number,
    spokeClient: across.clients.SpokePoolClient,
  ) {
    logger.info({
      message: "Starting update on spoke client",
      chainId,
    });
    await spokeClient.update();
    // TODO: store any data we need for configs in index

    const deposits = spokeClient.getDeposits();
    const fills = spokeClient.getFills();
    const slowFillRequests =
      spokeClient.getSlowFillRequestsForOriginChain(chainId);
    if (postgres) {
      await formatAndSaveDeposits(deposits);
      await formatAndSaveFills(fills);
      await formatAndSaveSlowFillRequests(slowFillRequests);
    }

    const latestBlockSearched = spokeClient.latestBlockSearched;
    logger.info({
      message: "Finished updating spoke client",
      chainId,
      latestBlockSearched,
      deposits: deposits.length,
      fills: fills.length,
      slowFillRequests: slowFillRequests.length,
    });
    if (redis) {
      await redis.set(
        getLastBlockSearchedKey("spokePool", chainId),
        latestBlockSearched,
      );
    }
  }

  return async function updateAll(now: number) {
    await updateConfigStore(now, hubPoolNetworkInfo.chainId);
    await updateHubPool(now, hubPoolNetworkInfo.chainId);
    // using all instead of all settled for now to make sure we easily see errors
    await Promise.all(
      spokeClientEntries.map(async ([chainId, spokeClient]) =>
        updateSpokePool(now, chainId, spokeClient),
      ),
    );
  };
}
