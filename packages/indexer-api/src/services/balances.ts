import assert from "assert";
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";
import {
  SpokePoolBalanceResultElement,
  SpokePoolBalanceResults,
} from "../dtos/balances.dto";

export class BalancesService {
  hubBalancesCache: Indexer.redis.hubBalancesCache.HubPoolBalanceCache;
  currentBundleLeavesCache: Indexer.redis.bundleLeavesCache.BundleLeavesCache;
  proposedBundleLeavesCache: Indexer.redis.bundleLeavesCache.BundleLeavesCache;
  constructor(redis: Redis) {
    this.hubBalancesCache =
      new Indexer.redis.hubBalancesCache.HubPoolBalanceCache({
        redis,
        prefix: "hubBalanceCache",
      });
    this.currentBundleLeavesCache =
      new Indexer.redis.bundleLeavesCache.BundleLeavesCache({
        redis,
        prefix: "currentBundleCache",
      });
    this.proposedBundleLeavesCache =
      new Indexer.redis.bundleLeavesCache.BundleLeavesCache({
        redis,
        prefix: "proposedBundleCache",
      });
  }
  async hubPoolBalance(params?: {
    l1Token?: string;
  }): Promise<Indexer.redis.hubBalancesCache.HubPoolBalances> {
    if (params?.l1Token) {
      const balance = await this.hubBalancesCache.get(params.l1Token);
      assert(balance, `No hubpoolBalance found for ${params.l1Token}`);
      return [balance];
    } else {
      return this.hubBalancesCache.getAllL1Tokens();
    }
  }

  async spokePoolBalance(params: {
    chainId: number;
    l1Token?: string;
  }): Promise<SpokePoolBalanceResults> {
    const { l1Token, chainId } = params;
    const bundleLeaves = await resolveAllL1Tokens(
      l1Token,
      chainId,
      this.proposedBundleLeavesCache,
      this.currentBundleLeavesCache,
    );
    return bundleLeaves.reduce(
      (acc, bundleLeaf) => ({
        ...acc,
        [bundleLeaf.chainId]: {
          lastExecutedRunningBalance: bundleLeaf.lastExecutedRunningBalance,
          pendingRunningBalance: bundleLeaf.pendingRunningBalance,
          pendingNetSendAmount: bundleLeaf.pendingNetSendAmount,
          currentRunningBalance: bundleLeaf.currentRunningBalance,
          currentNetSendAmount: bundleLeaf.currentNetSendAmount,
        },
      }),
      {} as SpokePoolBalanceResults,
    );
  }
}

function combineBundleLeaf(
  proposedBundleLeaf?: Indexer.redis.bundleLeavesCache.BundleLeaf,
  currentBundleLeaf?: Indexer.redis.bundleLeavesCache.BundleLeaf,
): SpokePoolBalanceResultElement & { chainId: number } {
  assert(currentBundleLeaf, "currentBundleLeaf is required");
  return {
    chainId: currentBundleLeaf.chainId,
    lastExecutedRunningBalance: currentBundleLeaf.lastExecutedRunningBalance,
    pendingRunningBalance: proposedBundleLeaf?.runningBalance ?? null,
    pendingNetSendAmount: proposedBundleLeaf?.netSendAmount ?? null,
    currentRunningBalance: currentBundleLeaf.runningBalance,
    currentNetSendAmount: currentBundleLeaf.netSendAmount,
  };
}

async function resolveAllL1Tokens(
  l1Token: string | undefined,
  chainId: number,
  proposedCache: Indexer.redis.bundleLeavesCache.BundleLeavesCache,
  currentCache: Indexer.redis.bundleLeavesCache.BundleLeavesCache,
): Promise<(SpokePoolBalanceResultElement & { chainId: number })[]> {
  if (l1Token) {
    const currentL1Cache = await currentCache.get(chainId, l1Token);
    const proposedL1Cache = await proposedCache.get(chainId, l1Token);
    return [combineBundleLeaf(proposedL1Cache, currentL1Cache)];
  } else {
    const currentL1Cache = await currentCache.getByChainId(chainId);
    return Promise.all(
      currentL1Cache
        .filter((v) => v !== undefined)
        .map(async (currentCacheValue) => {
          const proposedCacheValue = await proposedCache.get(
            currentCacheValue.chainId,
            currentCacheValue.l1Token,
          );
          return combineBundleLeaf(proposedCacheValue, currentCacheValue);
        }),
    );
  }
}
