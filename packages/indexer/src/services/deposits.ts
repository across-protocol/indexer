import assert from "assert";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";
import winston from "winston";
import Redis from "ioredis";

import { providers, Contract } from "ethers";

type Config = {
  providerUrls: string[];
  maxBlockLookBack?: number;
  logger: winston.Logger;
  redis: Redis | undefined;
};

type GetSpokeClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  redis: Redis | undefined;
  maxBlockLookBack: number;
  chainId: number;
};
export async function getSpokeClient(
  params: GetSpokeClientParams,
): Promise<across.clients.SpokePoolClient> {
  const { provider, logger, redis, maxBlockLookBack, chainId } = params;
  const address = getDeployedAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const latestBlockNumber = await provider.getBlockNumber();
  // for testing
  // let lastProcessedBlockNumber: number = latestBlockNumber - 10000;

  // need persistence for this, use it to resume query
  let lastProcessedBlockNumber: number = deployedBlockNumber;
  if (redis) {
    lastProcessedBlockNumber = Number(
      (await redis.get(getLastBlockSearchedKey(chainId))) ??
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
    null,
    chainId,
    deployedBlockNumber,
    eventSearchConfig,
  );
}
function getLastBlockSearchedKey(chainId: number): string {
  return [
    "depositIndexer",
    "spokePool",
    "lastProcessedBlockNumber",
    chainId,
  ].join("~");
}

export async function Indexer(config: Config) {
  const { providerUrls, maxBlockLookBack = 10000, logger, redis } = config;

  // const pg = config.postgres ? initPostgres(config.postgres) : undefined;

  const spokeClientEntries: [number, across.clients.SpokePoolClient][] =
    await Promise.all(
      providerUrls.map(async (providerUrl) => {
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
          }),
        ];
      }),
    );

  async function update(
    now: number,
    chainId: number,
    spokeClient: across.clients.SpokePoolClient,
  ) {
    logger.info({
      message: "Starting update on spoke client",
      chainId,
    });
    await spokeClient.update();
    const latestBlockSearched = spokeClient.latestBlockSearched;
    logger.info({
      message: "Finished updating spoke client",
      chainId,
      latestBlockSearched,
      fills: Object.values(spokeClient.fills).length,
      deposits: spokeClient.getDeposits().length,
    });
    if (redis) {
      await redis.set(getLastBlockSearchedKey(chainId), latestBlockSearched);
    }
  }

  return async function updateAll(now: number) {
    for (const [chainId, spokeClient] of spokeClientEntries) {
      await update(now, chainId, spokeClient);
    }
  };
}
