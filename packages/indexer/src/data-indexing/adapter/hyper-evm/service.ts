import { ethers } from "ethers";
import { CHAIN_IDs } from "@across-protocol/constants";
import { createMapWithDefault } from "../../../utils/map";
import {
  SimpleTransferFlowCompleted,
  SimpleTransferFlowCompletedABI,
  SimpleTransferFlowCompletedWithBlock,
  SwapFlowInitialized,
  SwapFlowInitializedABI,
  SwapFlowInitializedWithBlock,
} from "./model";

// we need to fetch only recent events, so
// roughly starting with date of Oct 1st, 2025
const STARTING_BLOCK_NUMBER = 15083577;

export const HYPERCORE_FLOW_EXECUTOR_ADDRESS: { [key: number]: string } =
  createMapWithDefault(
    {
      [CHAIN_IDs.HYPEREVM_TESTNET]:
        "0x06C61D54958a0772Ee8aF41789466d39FfeaeB13",
    },
    // TODO: Replace with actual address when available
    "0x06C61D54958a0772Ee8aF41789466d39FfeaeB13",
  );

export function getIndexingStartBlockNumber(chainId: number) {
  if (chainId !== CHAIN_IDs.HYPEREVM) {
    throw new Error(
      `HyperCoreFlowExecutor is only deployed on HyperEVM. ChainId: ${chainId}`,
    );
  }
  return STARTING_BLOCK_NUMBER;
}

export async function getSimpleTransferFlowCompletedEvents(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  fromBlock: number,
  toBlock: number,
): Promise<SimpleTransferFlowCompletedWithBlock[]> {
  const eventFilter = {
    address,
    topics: [
      SimpleTransferFlowCompletedABI.getEventTopic(
        "SimpleTransferFlowCompleted",
      ),
    ],
  };
  const logs = await provider.getLogs({
    ...eventFilter,
    fromBlock,
    toBlock,
  });

  return logs.map((log) => {
    const decodedLog = SimpleTransferFlowCompletedABI.parseLog(log);
    return {
      quoteNonce: decodedLog.args.quoteNonce,
      finalRecipient: decodedLog.args.finalRecipient,
      finalToken: decodedLog.args.finalToken,
      evmAmountIn: decodedLog.args.evmAmountIn.toString(),
      bridgingFeesIncurred: decodedLog.args.bridgingFeesIncurred.toString(),
      evmAmountSponsored: decodedLog.args.evmAmountSponsored.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionIndex: log.transactionIndex,
      transactionHash: log.transactionHash,
    };
  });
}

export async function getSwapFlowInitializedEvents(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  fromBlock: number,
  toBlock: number,
): Promise<SwapFlowInitializedWithBlock[]> {
  const eventFilter = {
    address,
    topics: [SwapFlowInitializedABI.getEventTopic("SwapFlowInitialized")],
  };
  const logs = await provider.getLogs({
    ...eventFilter,
    fromBlock,
    toBlock,
  });

  return logs.map((log) => {
    const decodedLog = SwapFlowInitializedABI.parseLog(log);
    return {
      quoteNonce: decodedLog.args.quoteNonce,
      finalRecipient: decodedLog.args.finalRecipient,
      finalToken: decodedLog.args.finalToken,
      evmAmountIn: decodedLog.args.evmAmountIn.toString(),
      bridgingFeesIncurred: decodedLog.args.bridgingFeesIncurred.toString(),
      coreAmountIn: decodedLog.args.coreAmountIn.toString(),
      minAmountToSend: decodedLog.args.minAmountToSend.toString(),
      maxAmountToSend: decodedLog.args.maxAmountToSend.toString(),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionIndex: log.transactionIndex,
      transactionHash: log.transactionHash,
    };
  });
}
