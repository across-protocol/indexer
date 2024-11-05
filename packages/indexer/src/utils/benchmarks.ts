import { Contract, ethers, providers } from "ethers";
import { IBenchmark } from "@repo/benchmark";
import winston from "winston";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SpokePool,
  SpokePool__factory as SpokePoolFactory,
} from "@across-protocol/contracts";
import { getAddress } from "./contractUtils";
import { Logger } from "ethers/lib/utils";

export type GetSpokeClientParams = {
  provider: providers.Provider;
  address: string;
};

export function getSpokepoolContract(params: GetSpokeClientParams) {
  return SpokePoolFactory.connect(params.address, params.provider);
}
export type ProviderChainId = {
  provider: providers.Provider;
  chainId: number;
};

export function listenForDeposits(
  benchmark: IBenchmark,
  chains: ProviderChainId[],
  logger: winston.Logger,
): () => void {
  const spokeClients: [SpokePool, number][] = chains.map(
    ({ provider, chainId }) => {
      const address = getAddress("SpokePool", chainId);
      return [getSpokepoolContract({ provider, address }), chainId];
    },
  );

  const unlistenFunctions = spokeClients.map(([spokeClient, chainId]) => {
    const onV3FundsDeposited = (depositId: string) => {
      const uniqueId = `${chainId}-${depositId}`;
      logger.debug({
        at: "Indexer.Benchmarks",
        uniqueId,
        chainId,
        message: "Saw V3 Funds deposited",
      });
      benchmark.start(uniqueId);
    };
    logger.info({
      at: "Indexer.Benchmarks",
      chainId,
      message: `Registering V3 Funds Deposited benchmarks for chain ${chainId}`,
    });
    spokeClient.on("V3FundsDeposited", onV3FundsDeposited);

    // Return a function to unlisten and clean up events for this client
    return () => {
      spokeClient.off("V3FundsDeposited", onV3FundsDeposited);
      logger.info({
        at: "Indexer.Benchmarks",
        chainId,
        message: `Unlistened from V3FundsDeposited for SpokePool at chainId ${chainId}`,
      });
    };
  });

  // Return a single function to unlisten from all events
  return () => {
    unlistenFunctions.forEach((unlisten) => unlisten());
  };
}
