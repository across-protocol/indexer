import { interfaces, providers } from "@across-protocol/sdk";
import assert from "assert";
import { findTokenByAddress } from "../utils";
import ethers from "ethers";

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

const swapBeforeBridgeEventTopic =
  "0x646284e396b68ff4b4f34e0aa97bcdb9c100f5b44a20da5c475f627039853841";
const swapBeforeBridgeEventAbi =
  "event SwapBeforeBridge(address indexed swapToken, address indexed acrossInputToken, address indexed acrossOutputToken, uint256 swapTokenAmount, uint256 acrossInputAmount, uint256 acrossOutputAmount)";

export type SwapBeforeBridgeEvent = {
  swapToken: string;
  acrossInputToken: string;
  acrossOutputToken: string;
  swapTokenAmount: string;
  acrossInputAmount: string;
  acrossOutputAmount: string;
};

export function isSwapBeforeBridgeEvent(log: ethers.providers.Log) {
  return log.topics[0] === swapBeforeBridgeEventTopic;
}
export async function getSwapBeforeBridgeEvents(
  provider: providers.RetryProvider,
  transactionHash: string,
  originChainId: number,
) {
  const transactionReceipt =
    await provider.getTransactionReceipt(transactionHash);
  const events = [];
  for (const log of transactionReceipt.logs) {
    if (!isSwapBeforeBridgeEvent(log)) continue;
    const event = {
      ...decodeSwapBeforeBridgeEvent(log),
      transactionHash,
      originChainId,
      logIndex: log.logIndex,
      blockHash: transactionReceipt.blockHash,
    };
    if (event) {
      events.push(event);
    }
  }
  return events;
}

export function decodeSwapBeforeBridgeEvent(log: ethers.providers.Log) {
  const iface = new ethers.utils.Interface([swapBeforeBridgeEventAbi]);
  const decodedLog = iface.parseLog(log);
  const {
    swapToken,
    acrossInputToken,
    acrossOutputToken,
    swapTokenAmount,
    acrossInputAmount,
    acrossOutputAmount,
  } = decodedLog.args;

  return {
    swapToken: swapToken,
    acrossInputToken: acrossInputToken,
    acrossOutputToken: acrossOutputToken,
    swapTokenAmount: swapTokenAmount.toString(),
    acrossInputAmount: acrossInputAmount.toString(),
    acrossOutputAmount: acrossOutputAmount.toString(),
  };
}

export function isV3FundsDepositedEvent(log: ethers.providers.Log): boolean {
  return (
    log.topics[0] ===
    "0xa123dc29aebf7d0c3322c8eeb5b999e859f39937950ed31056532713d0de396f"
  );
}

export function decodeV3FundsDepositedLog(log: ethers.providers.Log) {
  const iface = new ethers.utils.Interface([
    "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint32 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address indexed depositor, address recipient, address exclusiveRelayer, bytes message)",
  ]);
  const decodedLog = iface.parseLog(log);
  const {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    destinationChainId,
    depositId,
    quoteTimestamp,
    fillDeadline,
    exclusivityDeadline,
    depositor,
    recipient,
    exclusiveRelayer,
    message,
  } = decodedLog.args;

  return {
    inputToken: inputToken,
    outputToken: outputToken,
    inputAmount: inputAmount.toString(),
    outputAmount: outputAmount.toString(),
    destinationChainId: destinationChainId.toString(),
    depositId: depositId.toString(),
    quoteTimestamp: quoteTimestamp.toString(),
    fillDeadline: fillDeadline.toString(),
    exclusivityDeadline: exclusivityDeadline.toString(),
    depositor: depositor,
    recipient: recipient,
    exclusiveRelayer: exclusiveRelayer,
    message: message,
  };
}

export async function getV3FundsDepositedEvents(
  provider: providers.RetryProvider,
  transactionHash: string,
  originChainId: number,
) {
  const transactionReceipt =
    await provider.getTransactionReceipt(transactionHash);
  const events = [];
  for (const log of transactionReceipt.logs) {
    if (!isV3FundsDepositedEvent(log)) continue;
    const decodedEvent = decodeV3FundsDepositedLog(log);
    events.push({
      ...decodedEvent,
      transactionHash: transactionHash,
      logIndex: log.logIndex,
      originChainId: originChainId,
      blockHash: transactionReceipt.blockHash,
    });
  }
  return events;
}
