import { interfaces, providers } from "@across-protocol/sdk";
import { utils as ethersUtils } from "ethers";
import { SvmProvider } from "../web3/RetryProvidersFactory";

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
