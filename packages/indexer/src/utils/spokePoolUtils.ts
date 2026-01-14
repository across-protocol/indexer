import { interfaces, providers } from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";
import { utils as ethersUtils } from "ethers";

import { entities } from "@repo/indexer-database";

import { SvmProvider } from "../web3/RetryProvidersFactory";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "./contractFactoryUtils";
import { DataDogMetricsService } from "../services/MetricsService";
import { getMaxBlockLookBack } from "../web3/constants";
import { default as _ } from "lodash";

export type V3FundsDepositedWithIntegradorId = interfaces.DepositWithBlock & {
  integratorId?: string | undefined;
};

/**
 * Retrieves the 4-character integrator ID from the transaction data
 * associated with the provided transaction hash, if present.
 * The integrator ID is expected to be found after the delimiter "1dc0de" in the transaction data.
 * @async
 * @param provider The provider to fetch transaction details from.
 * @param depositDate
 * @param txHash The transaction hash to retrieve the input data of.
 * @returns The 4-character integrator ID if found, otherwise undefined.
 */
export async function getIntegratorId(
  provider: providers.RetryProvider,
  depositDate: Date,
  txHash: string,
) {
  // If deposit was made before integratorId implementation, skip request
  const INTEGRATOR_ID_IMPLEMENTATION_DATE = new Date(1718274000 * 1000);
  if (depositDate < INTEGRATOR_ID_IMPLEMENTATION_DATE) {
    return;
  }
  const INTEGRATOR_DELIMITER = "1dc0de";
  const INTEGRATOR_ID_LENGTH = 4; // Integrator ids are 4 characters long
  let integratorId = undefined;
  const txn = await provider.getTransaction(txHash);
  const txnData = txn.data;
  if (txnData.includes(INTEGRATOR_DELIMITER)) {
    integratorId = txnData
      .split(INTEGRATOR_DELIMITER)
      .pop()
      ?.substring(0, INTEGRATOR_ID_LENGTH);
  }
  return integratorId;
}

export async function getSvmIntegratorId(
  provider: SvmProvider,
  txnRef: any, // TODO: fix, should be Signature
) {
  const INTEGRATOR_DELIMITER = "1dc0de";
  const INTEGRATOR_ID_LENGTH = 4; // Integrator ids are 4 characters long
  const txn = await provider
    .getTransaction(txnRef, {
      maxSupportedTransactionVersion: 0,
    })
    .send();
  const txnLogs = txn?.meta?.logMessages;
  const integratorIdLog = txnLogs?.find((log) =>
    log.includes(INTEGRATOR_DELIMITER),
  );
  const integratorId = integratorIdLog
    ?.split(INTEGRATOR_DELIMITER)
    .pop()
    ?.substring(0, INTEGRATOR_ID_LENGTH);
  return integratorId;
}

export function getInternalHash(
  relayData: Omit<interfaces.RelayData, "message">,
  messageHash: string,
  destinationChainId: number,
): string {
  const _relayData = {
    originChainId: relayData.originChainId,
    depositId: relayData.depositId,
    inputAmount: relayData.inputAmount,
    outputAmount: relayData.outputAmount,
    messageHash: messageHash,
    fillDeadline: relayData.fillDeadline,
    exclusivityDeadline: relayData.exclusivityDeadline,
    depositor: relayData.depositor.toBytes32(),
    recipient: relayData.recipient.toBytes32(),
    inputToken: relayData.inputToken.toBytes32(),
    outputToken: relayData.outputToken.toBytes32(),
    exclusiveRelayer: relayData.exclusiveRelayer.toBytes32(),
  };
  return ethersUtils.keccak256(
    ethersUtils.defaultAbiCoder.encode(
      [
        "tuple(" +
          "bytes32 depositor," +
          "bytes32 recipient," +
          "bytes32 exclusiveRelayer," +
          "bytes32 inputToken," +
          "bytes32 outputToken," +
          "uint256 inputAmount," +
          "uint256 outputAmount," +
          "uint256 originChainId," +
          "uint256 depositId," +
          "uint32 fillDeadline," +
          "uint32 exclusivityDeadline," +
          "bytes messageHash" +
          ")",
        "uint256 destinationChainId",
      ],
      [_relayData, destinationChainId],
    ),
  );
}

/**
 * Generates a lock key for the deposit
 * @param deposit - The deposit event
 * @returns A tuple of the origin chain id and the internal hash as a 32-bit integer
 */
export function getDbLockKeyForDeposit(
  deposit:
    | entities.V3FundsDeposited
    | entities.FilledV3Relay
    | entities.RequestedV3SlowFill,
) {
  return [
    deposit.originChainId === CHAIN_IDs.SOLANA.toString()
      ? "342683945"
      : deposit.originChainId,
    // Convert internalHash into a 32-bit integer for database lock usage
    relayHashToInt32(deposit.internalHash!),
  ];
}

/**
 * Generates a lock key for oft events
 * @param event - The oft event
 * @returns The event's gui identifier hashed as a 32-bit integer
 */
export function getDbLockKeyForOftEvent(
  event: entities.OFTSent | entities.OFTReceived,
) {
  return [relayHashToInt32(event.guid)];
}

/**
 * Generates a 32bit integer based on an input string
 */
export function relayHashToInt32(relayHash: string): number {
  let hash = 0;
  let chr;

  // If the input string is empty, return 0
  if (relayHash.length === 0) return hash;

  // Loop through each character in the string
  for (let i = 0; i < relayHash.length; i++) {
    // Get the Unicode value of the character
    chr = relayHash.charCodeAt(i);

    // Perform bitwise operations to generate a hash
    // This shifts the hash left by 5 bits, subtracts itself, and adds the character code
    hash = (hash << 5) - hash + chr;

    // Convert the result into a 32-bit integer by forcing it into the signed integer range
    hash |= 0;
  }

  // Return the final computed 32-bit integer hash
  return hash;
}

/**
 * Spoke pool events
 * @param v3FundsDepositedEvents - V3 funds deposited events
 * @param filledV3RelayEvents - V3 relay events
 * @param requestedV3SlowFillEvents - V3 slow fill events
 * @param requestedSpeedUpV3Events - V3 speed up events
 * @param relayedRootBundleEvents - Root bundle relay events
 * @param executedRelayerRefundRootEvents - Root bundle executed events
 * @param tokensBridgedEvents - Tokens bridged events
 */
export type SpokePoolEvents = {
  v3FundsDepositedEvents: interfaces.DepositWithBlock[];
  filledV3RelayEvents: interfaces.FillWithBlock[];
  requestedV3SlowFillEvents: interfaces.SlowFillRequestWithBlock[];
  requestedSpeedUpV3Events: {
    [depositorAddress: string]: {
      [depositId: string]: interfaces.SpeedUpWithBlock[];
    };
  };
  relayedRootBundleEvents: interfaces.RootBundleRelayWithBlock[];
  executedRelayerRefundRootEvents: interfaces.RelayerRefundExecutionWithBlock[];
  tokensBridgedEvents: interfaces.TokensBridged[];
  claimedRelayerRefunds: interfaces.ClaimedRelayerRefundWithBlock[];
};

/**
 * Request object for fetching spoke pool events.
 * @param chainId The chain ID of the spoke pool.
 * @param fromBlockNumber The block number to fetch events for.
 * @param toBlockNumber The block number to fetch events for.
 * @param factories The factories for the spoke pool clients.
 * @param cache The cache for the spoke pool events.
 * @param metricsService The metrics service for the spoke pool events.
 */
export interface FetchSpokePoolEventsRequest {
  chainId: number;
  toBlockNumber: number;
  fromBlockNumber: number;
  factories: {
    spokePoolClientFactory: SpokePoolClientFactory;
    hubPoolClientFactory: HubPoolClientFactory;
    configStoreClientFactory: ConfigStoreClientFactory;
  };
  cache?: Map<string, SpokePoolEvents>;
  metricsService?: DataDogMetricsService;
}

/**
 * Fetches spoke pool events for the given chain and block number.
 * @param request The request object containing the chain ID, block number, factories, cache, and metrics service.
 * @returns The spoke pool events for the given chain and block number.
 */
export async function fetchSpokePoolEvents(
  request: FetchSpokePoolEventsRequest,
): Promise<SpokePoolEvents> {
  const {
    chainId,
    toBlockNumber,
    fromBlockNumber,
    factories,
    cache,
    metricsService,
  } = request;
  const cacheKey = `spoke-pool-events-${chainId}-${toBlockNumber}-${fromBlockNumber}`;

  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const {
    spokePoolClientFactory,
    hubPoolClientFactory,
    configStoreClientFactory,
  } = factories;

  // FIXME: hardcoded chain id to represent mainnet for hub/config
  const hubChainId = 1;

  const configStoreClient = configStoreClientFactory.get(hubChainId);
  const hubPoolClient = hubPoolClientFactory.get(
    hubChainId,
    undefined,
    undefined,
    {
      configStoreClient,
    },
  );

  const spokePoolClient = await spokePoolClientFactory.get(
    chainId,
    fromBlockNumber,
    toBlockNumber,
    {
      hubPoolClient,
      disableQuoteBlockLookup: true,
    },
    false,
  );

  // We use this pattern to measure the duration of the update call
  const startConfigStoreUpdate = Date.now();
  await configStoreClient.update();
  metricsService?.addGaugeMetric(
    "configStoreClientUpdate",
    Date.now() - startConfigStoreUpdate,
    [`chainId:${chainId}`],
  );

  const startHubPoolUpdate = Date.now();
  await hubPoolClient.update([
    "SetPoolRebalanceRoute",
    "CrossChainContractsSet",
  ]);
  metricsService?.addGaugeMetric(
    "hubPoolClientUpdate",
    Date.now() - startHubPoolUpdate,
    [`chainId:${chainId}`],
  );

  // We aim to avoid the unneeded update events
  // Specifically, we avoid the EnabledDepositRoute event because this
  // requires a lookback to the deployment block of the SpokePool contract.
  const startSpokePoolUpdate = Date.now();
  await spokePoolClient.update([
    "ClaimedRelayerRefund",
    "ExecutedRelayerRefundRoot",
    "FilledRelay",
    "FundsDeposited",
    "RelayedRootBundle",
    "RequestedSlowFill",
    "RequestedSpeedUpDeposit",
    "TokensBridged",
  ]);
  metricsService?.addGaugeMetric(
    "spokePoolClientUpdate",
    Date.now() - startSpokePoolUpdate,
    [`chainId:${chainId}`],
  );

  const v3FundsDepositedEvents = spokePoolClient.getDeposits({
    fromBlock: blockNumber,
    toBlock: blockNumber,
  });
  const filledV3RelayEvents = spokePoolClient.getFills();
  const requestedV3SlowFillEvents = spokePoolClient.getSlowFillRequests();
  const requestedSpeedUpV3Events = spokePoolClient.getSpeedUps();
  const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
  const executedRelayerRefundRootEvents =
    spokePoolClient.getRelayerRefundExecutions();
  const tokensBridgedEvents = spokePoolClient.getTokensBridged();
  const claimedRelayerRefunds = spokePoolClient.getClaimedRelayerRefunds();

  const result: SpokePoolEvents = {
    v3FundsDepositedEvents,
    filledV3RelayEvents,
    requestedV3SlowFillEvents,
    requestedSpeedUpV3Events,
    relayedRootBundleEvents,
    executedRelayerRefundRootEvents,
    tokensBridgedEvents,
    claimedRelayerRefunds,
  };

  if (cache) {
    cache.set(cacheKey, result);
  }

  return result;
}
