import winston from "winston";
import { providers, Contract } from "ethers";
import { address } from "@solana/kit";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";

import { EvmSpokePoolClient, SvmSpokePoolClient } from "./clients";
import { SvmProvider } from "../web3/RetryProvidersFactory";

export const CONFIG_STORE_VERSION = 4;

export type GetEvmSpokeClientParams = {
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
 * Resolves an EVM spoke pool client with the given parameters
 * @param params Parameters to resolve a spoke client.
 * @returns A spoke pool client configured with the given parameters
 * @see {@link across.clients.EvmSpokePoolClient} for client
 * @see {@link GetSpokeClientParams} for params
 */
export function getEvmSpokeClient(
  params: GetEvmSpokeClientParams,
): across.clients.SpokePoolClient {
  const { provider, logger, maxBlockLookBack, chainId, hubPoolClient } = params;
  if (!across.utils.chainIsEvm(chainId)) {
    throw new Error(`Chain ${chainId} is not an EVM chain`);
  }
  const address = getAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  const to = params.toBlock;
  const from = params.fromBlock ?? deployedBlockNumber;

  const disableQuoteBlockLookup = params.disableQuoteBlockLookup ?? false;

  const eventSearchConfig = {
    from,
    to,
    maxLookBack: maxBlockLookBack,
  };
  logger.debug({
    at: "Indexer#contractUtils#getSpokePoolClient",
    message: "Initializing spoke pool",
    chainId,
    address,
    deployedBlockNumber,
    ...eventSearchConfig,
    blockRangeSearched: `${from} to ${to ?? "latest"}`,
  });
  const spokePoolContract = new Contract(
    address,
    SpokePoolFactory.abi,
    provider,
  );
  return new EvmSpokePoolClient(
    logger,
    spokePoolContract,
    hubPoolClient,
    chainId,
    deployedBlockNumber,
    eventSearchConfig,
    disableQuoteBlockLookup,
  );
}

export type GetSvmSpokeClientParams = {
  chainId: number;
  provider: SvmProvider;
  logger: winston.Logger;
  maxBlockLookBack: number;
  fromBlock?: number;
  toBlock?: number;
  hubPoolClient: across.clients.HubPoolClient;
  disableQuoteBlockLookup?: boolean;
};

/**
 * Resolves an SVM spoke pool client with the given parameters
 * @param params Parameters to resolve an SVM spoke client.
 * @returns A spoke pool client configured with the given parameters
 * @see {@link across.clients.SVMSpokePoolClient} for client
 * @see {@link GetSpokeClientParams} for params
 */
export async function getSvmSpokeClient(
  params: GetSvmSpokeClientParams,
): Promise<across.clients.SpokePoolClient> {
  const { provider, logger, maxBlockLookBack, chainId, hubPoolClient } = params;
  if (!across.utils.chainIsSvm(chainId)) {
    throw new Error(`Chain ${chainId} is not an SVM chain`);
  }
  const programId = getAddress("SvmSpoke", chainId);
  const statePda = await across.arch.svm.getStatePda(address(programId));
  const deploymentSlot = getDeployedBlockNumber("SvmSpoke", chainId);

  const to = params.toBlock;
  const from = params.fromBlock ?? deploymentSlot;
  const eventSearchConfig = {
    from,
    to,
    maxLookBack: maxBlockLookBack,
  };

  const disableQuoteBlockLookup = params.disableQuoteBlockLookup ?? false;

  const svmEventsClient =
    await across.arch.svm.SvmCpiEventsClient.create(provider);

  logger.debug({
    at: "Indexer#contractUtils#getSvmSpokeClient",
    message: "Initializing SVM spoke pool",
    chainId,
    programId,
    deploymentSlot,
    ...eventSearchConfig,
    slotRangeSearched: `${from} to ${to ?? "latest"}`,
  });

  return new SvmSpokePoolClient(
    logger,
    hubPoolClient,
    chainId,
    BigInt(deploymentSlot),
    eventSearchConfig,
    svmEventsClient,
    address(programId),
    statePda,
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
    from: lastProcessedBlockNumber,
    maxLookBack: maxBlockLookBack,
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
  const from = params.fromBlock ?? deployedBlockNumber;
  const to = params.toBlock;

  const eventSearchConfig = {
    from,
    to,
    maxLookBack: maxBlockLookBack,
  };
  logger.debug({
    at: "Indexer#contractUtils#getHubPoolClient",
    message: "Initializing hubpool",
    chainId,
    ...eventSearchConfig,
    blockRangeSearched: `${from} to ${to ?? "latest"}`,
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

export const BN_ZERO = across.utils.bnZero;
