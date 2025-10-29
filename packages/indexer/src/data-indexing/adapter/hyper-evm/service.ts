import { ethers } from "ethers";
import { CHAIN_IDs } from "@across-protocol/constants";

import {
  SimpleTransferFlowCompleted,
  SimpleTransferFlowCompletedABI,
  SimpleTransferFlowCompletedWithBlock,
} from "./model";

// we need to fetch only recent events, so
// roughly starting with date of Oct 1st, 2025
const STARTING_BLOCK_NUMBER = 15083577;

export function getIndexingStartBlockNumber(chainId: number) {
  if (chainId !== CHAIN_IDs.HYPEREVM) {
    throw new Error(
      `HyperCoreFlowExecutor is only deployed on HyperEVM. ChainId: ${chainId}`,
    );
  }
  return STARTING_BLOCK_NUMBER;
}

export function getHyperCoreFlowExecutorAddress(chainId: number): string {
  if (chainId !== CHAIN_IDs.HYPEREVM) {
    throw new Error(
      `HyperCoreFlowExecutor is only deployed on HyperEVM. ChainId: ${chainId}`,
    );
  }
  // TODO: Replace with actual address when available
  return "0x0000000000000000000000000000000000000000";
}

export function parseSimpleTransferFlowCompleted(
  decodedLog: ethers.utils.LogDescription,
): SimpleTransferFlowCompleted {
  const {
    quoteNonce,
    finalRecipient,
    finalToken,
    evmAmountIn,
    bridgingFeesIncurred,
    evmAmountSponsored,
  } = decodedLog.args;

  return {
    quoteNonce,
    finalRecipient,
    finalToken,
    evmAmountIn: evmAmountIn.toString(),
    bridgingFeesIncurred: bridgingFeesIncurred.toString(),
    evmAmountSponsored: evmAmountSponsored.toString(),
  };
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
      ...parseSimpleTransferFlowCompleted(decodedLog),
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionIndex: log.transactionIndex,
      transactionHash: log.transactionHash,
    };
  });
}
