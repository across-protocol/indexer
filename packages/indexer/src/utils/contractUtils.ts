import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import winston from "winston";
import * as across from "@across-protocol/sdk";
import { providers, Contract } from "ethers";

export const CONFIG_STORE_VERSION = 4;
export const ACROSS_V3_MAINNET_DEPLOYMENT_BLOCK = 19277710;

export type GetSpokeClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  fromBlock?: number;
  toBlock?: number;
  chainId: number;
  hubPoolClient: across.clients.HubPoolClient;
  disableQuoteBlockLookup?: boolean;
};

function getAddress(contractName: string, chainId: number): string {
  const address = getDeployedAddress(contractName, chainId);
  if (!address) {
    throw new Error(
      `Address for contract ${contractName} on ${chainId} not found `,
    );
  }
  return address;
}

/**
 * Resolves a spoke pool client with the given parameters
 * @param params Parameters to resolve a spoke client.
 * @returns A spoke pool client configured with the given parameters
 * @see {@link across.clients.SpokePoolClient} for client
 * @see {@link GetSpokeClientParams} for params
 */
export function getSpokeClient(
  params: GetSpokeClientParams,
): across.clients.SpokePoolClient {
  const { provider, logger, maxBlockLookBack, chainId, hubPoolClient } = params;
  const address = getAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const toBlock = params.toBlock;
  const fromBlock = params.fromBlock ?? deployedBlockNumber;

  const disableQuoteBlockLookup = params.disableQuoteBlockLookup ?? false;

  const eventSearchConfig = {
    fromBlock,
    toBlock,
    maxBlockLookBack,
  };
  logger.debug({
    at: "Indexer#contractUtils#getSpokePoolClient",
    message: "Initializing spoke pool",
    chainId,
    address,
    deployedBlockNumber,
    ...eventSearchConfig,
    blockRangeSearched: `${fromBlock} to ${toBlock ?? "latest"}`,
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
    disableQuoteBlockLookup,
  );
}

export type GetConfigStoreClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  chainId: number;
};

/**
 * Resolves a config store client with the given parameters
 * @param params Parameters to resolve a config store client
 * @returns A config store client configured with the given parameters
 * @see {@link across.clients.AcrossConfigStoreClient} for client
 * @see {@link GetConfigStoreClientParams} for params
 */
export function getConfigStoreClient(
  params: GetConfigStoreClientParams,
): across.clients.AcrossConfigStoreClient {
  const { provider, logger, maxBlockLookBack, chainId } = params;
  const address = getAddress("AcrossConfigStore", chainId);
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

export type GetHubPoolClientParams = {
  provider: providers.Provider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  chainId: number;
  configStoreClient: across.clients.AcrossConfigStoreClient;
  // dont usually need to include these
  fromBlock?: number;
  toBlock?: number;
};

/**
 * Resolves a hub pool client with the given parameters
 * @param params Parameters to resolve a hub pool client
 * @returns A hub pool client configured with the given parameters
 * @see {@link across.clients.HubPoolClient} for client
 * @see {@link GetHubPoolClientParams} for params
 */
export function getHubPoolClient(
  params: GetHubPoolClientParams,
): across.clients.HubPoolClient {
  const { provider, logger, maxBlockLookBack, chainId, configStoreClient } =
    params;
  const address = getAddress("HubPool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("HubPool", chainId);

  const hubPoolContract = new Contract(address, HubPoolFactory.abi, provider);
  const fromBlock = params.fromBlock ?? deployedBlockNumber;
  const toBlock = params.toBlock;

  const eventSearchConfig = {
    fromBlock,
    toBlock,
    maxBlockLookBack,
  };
  logger.debug({
    at: "Indexer#contractUtils#getHubPoolClient",
    message: "Initializing hubpool",
    chainId,
    ...eventSearchConfig,
    blockRangeSearched: `${fromBlock} to ${toBlock ?? "latest"}`,
  });
  return new across.clients.HubPoolClient(
    logger,
    hubPoolContract,
    configStoreClient,
    deployedBlockNumber,
    chainId,
    eventSearchConfig,
  );
}

export type RetryProviderConfig = {
  providerCacheNamespace: string;
  maxConcurrency: number;
  pctRpcCallsLogged: number;
  standardTtlBlockDistance: number;
  noTtlBlockDistance: number;
  providerCacheTtl: number;
  nodeQuorumThreshold: number;
  retries: number;
  delay: number;
  providerConfigs: [providerUrls: string, chainId: number][];
  chainId: number;
};
export type RetryProviderDeps = {
  cache: across.interfaces.CachingMechanismInterface;
  logger: winston.Logger;
};

export function getRetryProvider(
  params: RetryProviderConfig & RetryProviderDeps,
) {
  return new across.providers.RetryProvider(
    params.providerConfigs,
    params.chainId,
    params.nodeQuorumThreshold,
    params.retries,
    params.delay,
    params.maxConcurrency,
    params.providerCacheNamespace,
    params.pctRpcCallsLogged,
    params.cache,
    params.standardTtlBlockDistance,
    params.noTtlBlockDistance,
    params.providerCacheTtl,
    params.logger,
  );
}

export const BN_ZERO = across.utils.bnZero;
