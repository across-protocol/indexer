import winston from "winston";
import { providers, Contract } from "ethers";
import { address } from "@solana/kit";
import { CHAIN_IDs } from "@across-protocol/constants";
import { Logger } from "winston";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
  HubPool__factory as HubPoolFactory,
  AcrossConfigStore__factory as AcrossConfigStoreFactory,
} from "@across-protocol/contracts";
import { assert } from "@repo/error-handling";
import { getDeployedAddress as getDeployedAddressBetaRelease } from "@across-protocol/contracts-beta";
import * as across from "@across-protocol/sdk";
import { ethers } from "ethers";
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

export type DecodedEventWithTxHash = {
  decodedEvent: ethers.utils.LogDescription;
  transactionHash: string;
};

/**
 * Fetches and decodes blockchain events from a specified contract within a given block range.
 * This utility is designed to be generic, allowing it to be used for various event types,
 * such as 'Transfer' events for both CCTP and OFT protocols.
 *
 * @param provider The ethers.js provider instance to interact with the blockchain.
 * @param contractAddress The address of the contract to query for events.
 * @param eventAbi A string containing the ABI of the single event to fetch (e.g., "event Transfer(address indexed from, address indexed to, uint256 value)").
 * @param fromBlock The starting block number for the event search.
 * @param toBlock The ending block number for the event search.
 * @returns A promise that resolves to an array of objects, each containing the decoded event and its transaction hash.
 */
export async function fetchEvents(
  provider: ethers.providers.Provider,
  contractAddress: string,
  eventAbi: string,
  fromBlock: number,
  toBlock: number,
): Promise<DecodedEventWithTxHash[]> {
  // Create an interface for the event ABI to parse logs.
  const eventInterface = new ethers.utils.Interface([eventAbi]);
  // The event ABI string should contain only one event definition.
  // We extract the event name from the parsed ABI.
  const eventKeys = Object.keys(eventInterface.events);
  const firstEventKey = eventKeys[0];
  if (!firstEventKey) {
    // If no event is found in the ABI, return an empty array.
    return [];
  }
  const eventName = eventInterface.events[firstEventKey];
  if (!eventName) {
    return [];
  }
  // Get the event topic hash to filter logs. This allows us to fetch only the logs for the specified event.
  const eventTopic = eventInterface.getEventTopic(eventName);
  const logs = await provider.getLogs({
    address: contractAddress,
    fromBlock,
    toBlock,
    topics: [eventTopic],
  });

  // Decode each log and pair it with its transaction hash.
  const decodedEventsWithTxHash = logs.map((log) => {
    return {
      decodedEvent: eventInterface.parseLog(log),
      transactionHash: log.transactionHash,
    };
  });

  return decodedEventsWithTxHash;
}

export const BN_ZERO = across.utils.bnZero;

/**
 * Union type representing the valid beta contract names available for sponsored flows.
 */
type BetaContractName =
  | "SponsoredCCTPDstPeriphery"
  | "DstOFTHandler"
  | "SponsoredCCTPSrcPeriphery"
  | "SponsoredOFTSrcPeriphery";

/**
 * Retrieves the deployed address for a specific beta release contract on a given chain.
 *
 * @param {BetaContractName} name - The specific name of the beta contract to look up.
 * @param {number} chainId - The numeric ID of the blockchain network.
 * @returns {string | undefined} The deployed contract address or undefined if it was not found.
 */
function getBetaContractAddress(
  name: BetaContractName,
  chainId: number,
  logger?: Logger,
): string | undefined {
  // getDeployedAddressBetaRelease throws an error if the address does not exist
  try {
    const address = getDeployedAddressBetaRelease(name, chainId);
    if (!address) {
      throw new Error(`Address for contract ${name} on ${chainId} not found `);
    }
    return ethers.utils.getAddress(address);
  } catch (error) {
    const message = `Error trying to fetch contract address for ${name} on chain with chain ID ${chainId}`;
    if (logger) {
      logger.error({
        at: "Indexer#getBetaContractAddress",
        message,
        error,
        errorJson: JSON.stringify(error),
      });
    }
  }
}

/**
 * Gets the Sponsored CCTP Destination Periphery address.
 * * @param {number} [chainId=CHAIN_IDs.HYPEREVM] - The chain ID to fetch the address for. Defaults to HyperEVM.
 * @returns {string} The deployed contract address.
 */
export const getSponsoredCCTPDstPeripheryAddress = (
  chainId: number = CHAIN_IDs.HYPEREVM,
) => getBetaContractAddress("SponsoredCCTPDstPeriphery", chainId);

/**
 * Gets the Sponsored CCTP Source Periphery address.
 * * @param {number} chainId - The chain ID to fetch the address for.
 * @returns {string} The deployed contract address.
 */
export const getSponsoredCCTPSrcPeripheryAddress = (chainId: number) =>
  getBetaContractAddress("SponsoredCCTPSrcPeriphery", chainId);

/**
 * Gets the Sponsored OFT Source Periphery address.
 * * @param {number} chainId - The chain ID to fetch the address for.
 * @returns {string} The deployed contract address.
 */
export const getSponsoredOFTSrcPeripheryAddress = (chainId: number) =>
  getBetaContractAddress("SponsoredOFTSrcPeriphery", chainId);

/**
 * Gets the Destination OFT Handler address.
 * * @param {number} [chainId=CHAIN_IDs.HYPEREVM] - The chain ID to fetch the address for. Defaults to HyperEVM.
 * @returns {string} The deployed contract address.
 */
export const getDstOFTHandlerAddress = (chainId = CHAIN_IDs.HYPEREVM) =>
  getBetaContractAddress("DstOFTHandler", chainId);
