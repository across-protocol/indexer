import assert from "assert";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool__factory as SpokePoolFactory,
} from "@across-protocol/contracts";
import { utils } from "@across-protocol/sdk";

import { providers } from "ethers";

type Deposit = {
  status: string;
  relayData: string;
  uuid: string;
  expiredRefundBundle: string;
  slowFillBundle: string;
};
type Config = {
  provider: providers.JsonRpcProvider;
  maxBlockLookBack?: number;
};
export async function Indexer(config: Config) {
  const { provider, maxBlockLookBack = 1000 } = config;
  const networkInfo = await provider.getNetwork();
  const { chainId } = networkInfo;

  const address = getDeployedAddress("SpokePool", chainId);
  const deployedBlockNumber = getDeployedBlockNumber("SpokePool", chainId);

  // need persistence for this, use it to resume query
  const lastProcessedBlockNumber = 0;

  const spokePool = SpokePoolFactory.connect(address, config.provider);
  // currently only querying one event, but can be expanded to more
  const fundsDepositedFilter = spokePool.filters.V3FundsDeposited();
  const currentBlockNumber = await provider.getBlockNumber();
  const paginatedRanges = utils.getPaginatedBlockRanges({
    fromBlock: Math.max(deployedBlockNumber, lastProcessedBlockNumber),
    toBlock: currentBlockNumber,
    maxBlockLookBack,
  });
  for (const [fromBlock, toBlock] of paginatedRanges) {
    const events = await spokePool.queryFilter(
      fundsDepositedFilter,
      fromBlock,
      toBlock,
    );
    console.log("Processing block range", fromBlock, toBlock);
    // convert to some deposit object,
    const deposits = events.map((event) => {
      return {
        inputToken: event.args.inputToken,
        outputToken: event.args.outputToken,
        inputAmount: event.args.inputAmount.toString(),
        outputAmount: event.args.outputAmount.toString(),
        destinationChainId: event.args.destinationChainId.toNumber(),
        sourceChainId: chainId,
        depositId: event.args.depositId,
        quoteTimestamp: event.args.quoteTimestamp,
        fillDeadline: event.args.fillDeadline,
        exclusivityDeadline: event.args.exclusivityDeadline,
        depositor: event.args.depositor,
        recipient: event.args.recipient,
        exclusiveRelayer: event.args.exclusiveRelayer,
        message: event.args.message,
      };
    });
    // persist or cache somewhere for further processing
  }
}
