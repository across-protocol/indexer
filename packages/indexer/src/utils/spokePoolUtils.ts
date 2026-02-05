import { interfaces, providers } from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";
import { utils as ethersUtils } from "ethers";
import { Signature } from "@solana/kit";
import { entities } from "@repo/indexer-database";
import { SvmProvider } from "../web3/RetryProvidersFactory";
import { TransactionReceipt } from "viem";

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
    .getTransaction(txnRef as Signature, {
      maxSupportedTransactionVersion: 0,
      encoding: "json",
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
 * Calculates total gas fees for a collection of Viem transaction receipts.
 * * Formula: gasUsed * effectiveGasPrice
 * Both values are native bigints in Viem.
 * * @param txReceipts - A record of transaction hashes mapping to Viem TransactionReceipts.
 * @returns A record of transaction hashes mapping to their total gas fee as a bigint.
 */
export async function getGasFeeFromTransactionReceipt(
  txReceipts: Record<string, TransactionReceipt>,
): Promise<Record<string, bigint | undefined>> {
  return Object.keys(txReceipts).reduce(
    (acc, txHash) => {
      const receipt = txReceipts[txHash];

      // Safety check for undefined receipts
      if (!receipt) return acc;

      // Viem receipts use native bigint for these properties
      acc[txHash] = receipt.gasUsed * receipt.effectiveGasPrice;

      return acc;
    },
    {} as Record<string, bigint | undefined>,
  );
}
