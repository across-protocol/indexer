import { entities } from "@repo/indexer-database";
import { BundleRepository } from "../database/BundleRepository";
import winston from "winston";
import { utils } from "@across-protocol/sdk";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

export type ProposalRange = Pick<
  entities.ProposedRootBundle,
  "bundleEvaluationBlockNumbers" | "chainIds"
>;

export type ProposalRangeResult = {
  chainId: number;
  startBlock: number;
  endBlock: number;
};

/**
 * Retrieves the most recent proposed and executed bundles from the database.
 * @param dbRepository - The database repository to query.
 * @param logger - The logger to use for logging.
 * @returns The most recent proposed and executed bundles. The proposed bundle may be undefined.
 * @throws If no executed bundles are found or if the proposed bundle is older than the last executed bundle.
 * @dev Used to grab the needed bundles to know bundle ranges
 */
export async function resolveMostRecentProposedAndExecutedBundles(
  dbRepository: BundleRepository,
  logger: winston.Logger,
) {
  const [lastExecutedBundle, lastProposedBundle] = await Promise.all([
    dbRepository.retrieveMostRecentBundle(entities.BundleStatus.Executed),
    dbRepository.retrieveMostRecentBundle(entities.BundleStatus.Proposed),
  ]);
  // If no executed bundle is found, the system is in an inconsistent state
  if (!utils.isDefined(lastExecutedBundle)) {
    logger.error({
      message: "No executed bundles found",
      at: "resolveMostRecentProposedAndExecutedBundles",
    });
    throw new Error("No executed bundles found");
  }
  // If a proposed bundle is found, it must be newer than the last executed bundle
  // otherwise, the system is in an inconsistent state
  if (
    !utils.isDefined(lastProposedBundle) ||
    lastProposedBundle.proposal.blockNumber <
      lastExecutedBundle.proposal.blockNumber
  ) {
    logger.error({
      message:
        "Inconsistent state: found proposed bundle is older than last executed bundle",
      at: "resolveMostRecentProposedAndExecutedBundles",
      proposedBundleHash: lastProposedBundle!.proposal.transactionHash,
      lastExecutedBundleHash: lastExecutedBundle.proposal.transactionHash,
    });
  }
  return { lastExecutedBundle, lastProposedBundle };
}

/**
 * Given the previous and current proposed bundles, returns the block ranges for each chain.
 * @param previous The previous proposed bundle range.
 * @param current The current proposed bundle range.
 * @returns The block ranges for each chain. For each chain, this is the previous
 *          proposal's evaluation block number + 1 to the current proposal's evaluation block
 *          number. In the case that the new proposal includes ranges for a chain that was not
 *          previously included, the range starts at block 0 for that chain per the ACX UMIP. We
 *          also ensure that disabled chains aren't ticked up. I.e. if a chain has the same end
 *          block as the previous proposal range, we don't increment.
 * @dev The ordering of the ranges is the same as the chainIds in the current proposal.
 */
export function getBlockRangeBetweenBundles(
  previous: ProposalRange,
  current: ProposalRange,
): ProposalRangeResult[] {
  return current.chainIds.map((chainId, idx) => ({
    chainId,
    // Prevent incrementing disabled chains by floor-ing the previous block number as
    // the start block should never be greater than the end block.
    startBlock: Math.min(
      previous.bundleEvaluationBlockNumbers[idx]
        ? previous.bundleEvaluationBlockNumbers[idx] + 1
        : 0, // If this is a new chain, start from block 0
      current.bundleEvaluationBlockNumbers[idx]!,
    ),
    endBlock: current.bundleEvaluationBlockNumbers[idx]!,
  }));
}

/**
 * Given the previous proposed bundle and the provider lookup, returns the block ranges
 * from the previous bundle's evaluation block numbers ( + 1) to the current head block
 * for each chain.
 * @param previous The previous proposed bundle range.
 * @param providers A lookup of RetryProviders for each chain.
 * @param disabledChainIds a list of chainIds whose ranges will *not* tick forward
 * @returns The block ranges for each chain. For each chain, this is the previous proposal's
 *          evaluation block number + 1 to the current head block number. If a chainId is
 *          included in the `disabledChainIds` list it will not be incremented to head and
 *          will be returned as [previousBlock, previousBlock]
 * @dev The ordering of the ranges is the same as the chainIds in the previous proposal.
 */
export async function getBlockRangeFromBundleToHead(
  previous: ProposalRange,
  providers: RetryProvidersFactory,
  disabledChainIds: number[] = [],
): Promise<ProposalRangeResult[]> {
  return Promise.all(
    previous.chainIds.map(async (chainId, idx) => {
      const previousBlock = previous.bundleEvaluationBlockNumbers[idx]!;
      if (disabledChainIds.includes(chainId)) {
        return { chainId, startBlock: previousBlock, endBlock: previousBlock };
      } else {
        const provider = providers.getProviderForChainId(chainId);
        const currentBlock = await provider.getBlockNumber();
        return {
          chainId,
          startBlock: previousBlock + 1,
          endBlock: currentBlock,
        };
      }
    }),
  );
}

export function convertProposalRangeResultToProposalRange(
  ranges: ProposalRangeResult[],
): ProposalRange {
  return {
    chainIds: ranges.map((r) => r.chainId),
    bundleEvaluationBlockNumbers: ranges.map((r) => r.endBlock),
  };
}
