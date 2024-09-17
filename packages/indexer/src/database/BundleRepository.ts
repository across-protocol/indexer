import winston from "winston";
import { DataSource, entities, utils } from "@repo/indexer-database";

export type BlockRangeInsertType = {
  bundleId: number;
  chainId: number;
  startBlock: number;
  endBlock: number;
};

/**
 * An abstraction class for interacting with the database for bundle-related operations.
 */
export class BundleRepository extends utils.BaseRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    throwError: boolean,
  ) {
    super(postgres, logger, throwError);
  }

  /**
   * Retrieves all canceled root bundle events that haven't been associated to a bundle relation yet.
   * @returns A list of partial canceled root bundle entities
   */
  public retrieveUnassociatedCanceledEvents(): Promise<
    Pick<
      entities.RootBundleCanceled,
      "blockNumber" | "transactionHash" | "logIndex" | "transactionIndex" | "id"
    >[]
  > {
    const canceledRootBundleRepository = this.postgres.getRepository(
      entities.RootBundleCanceled,
    );
    // Find all canceled events that haven't been associated with a bundle.
    return canceledRootBundleRepository
      .createQueryBuilder("drb")
      .select([
        "drb.id",
        "drb.blockNumber",
        "drb.logIndex",
        "drb.transactionIndex",
      ])
      .leftJoin("bundle", "b", "b.cancelationId = drb.id")
      .where("b.cancelationId IS NULL")
      .getMany();
  }

  /**
   * Retrieves all disputes that haven't been associated to a bundle relation yet.
   * @returns A list of partial disputed root bundle entities
   */
  public retrieveUnassociatedDisputedEvents(): Promise<
    Pick<
      entities.RootBundleDisputed,
      "blockNumber" | "transactionHash" | "logIndex" | "transactionIndex" | "id"
    >[]
  > {
    const disputedRootBundleRepository = this.postgres.getRepository(
      entities.RootBundleDisputed,
    );

    // Find all disputed events that haven't been associated with a bundle.
    return disputedRootBundleRepository
      .createQueryBuilder("drb")
      .select([
        "drb.id",
        "drb.blockNumber",
        "drb.logIndex",
        "drb.transactionIndex",
      ])
      .leftJoin("bundle", "b", "b.disputeId = drb.id")
      .where("b.disputeId IS NULL")
      .getMany();
  }

  public retrieveUnassociatedProposedRootBundleEvents(): Promise<
    Pick<
      entities.ProposedRootBundle,
      "slowRelayRoot" | "poolRebalanceRoot" | "relayerRefundRoot" | "id"
    >[]
  > {
    const proposedRootBundleRepository = this.postgres.getRepository(
      entities.ProposedRootBundle,
    ); // Grab all relevant proposed root bundle events that haven't been associated yet with a bundle.
    // This query uses a LEFT JOIN to find `ProposedRootBundle` records (`prb`) where no `Bundle`
    // is associated via the `proposal` foreign key (indicated by checking for NULL values in the `Bundle` table).
    return proposedRootBundleRepository
      .createQueryBuilder("prb")
      .select([
        "prb.id",
        "prb.poolRebalanceRoot",
        "prb.relayerRefundRoot",
        "prb.slowRelayRoot",
      ])
      .leftJoin("bundle", "b", "b.proposalId = prb.id")
      .where("b.proposalId IS NULL")
      .getMany();
  }

  public retrieveBundlesWithoutBlockRangesDefined(): Promise<
    Pick<entities.Bundle, "id" | "proposal">[]
  > {
    return this.postgres
      .getRepository(entities.Bundle)
      .createQueryBuilder("b")
      .leftJoinAndSelect("b.proposal", "proposal")
      .leftJoin("bundle_block_range", "br", "b.id = br.bundleId")
      .where("br.bundleId IS NULL")
      .select(["b.id", "proposal"])
      .getMany();
  }

  /**
   * Retrieves the closest proposed root bundle to the given block number, transaction index, and log index. The
   * proposed root bundle can be no further back than the given max lookback from the provided block number.
   * @param blockNumber The block number to search from
   * @param transactionIndex The transaction index in the block to search from
   * @param logIndex The log index in the transaction to search from
   * @param maxLookbackFromBlock The maximum number of blocks to look back from the provided block number
   * @returns The closest proposed (undisputed/non-canceled) root bundle back in time, or undefined if none are found
   */
  public retrieveClosestProposedRootBundle(
    blockNumber: number,
    transactionIndex: number,
    logIndex: number,
    maxLookbackFromBlock: number = 0,
  ): Promise<entities.ProposedRootBundle | null> {
    return this.postgres
      .getRepository(entities.ProposedRootBundle)
      .createQueryBuilder("prb")
      .leftJoin(entities.Bundle, "b", "b.proposalId = prb.id")
      .where(
        // Proposal is in the past
        "(prb.blockNumber < :blockNumber OR " +
          // Proposal happened earlier in the block
          "(prb.blockNumber = :blockNumber AND prb.transactionIndex < :transactionIndex) OR " +
          // Proposal happened earlier in the same transaction
          "(prb.blockNumber = :blockNumber AND prb.transactionIndex = :transactionIndex AND prb.logIndex < :logIndex)) AND " +
          // Ensure the block difference is less than an average bundle length in ETH blocks
          "prb.blockNumber > :blockDiff AND" +
          // The bundle hasn't been disputed or canceled. This is a valid bundle to execute.
          "(b.disputeId IS NULL AND b.cancelationId IS NULL)",
        {
          blockNumber,
          transactionIndex,
          logIndex,
          blockDiff: blockNumber - maxLookbackFromBlock,
        },
      )
      .orderBy("prb.blockNumber", "DESC") // Grab the most recent proposal
      .getOne();
  }

  /**
   * Creates a bundle for each proposed root bundle event that hasn't been associated with a bundle yet.
   * @param proposalEvents Unassociated proposed root bundle events that need to be associated with a bundle
   * @returns The number of bundles created
   */
  public async createBundlesForProposedEvents(
    proposalEvents: Pick<
      entities.ProposedRootBundle,
      "slowRelayRoot" | "poolRebalanceRoot" | "relayerRefundRoot" | "id"
    >[],
  ): Promise<number> {
    const bundleRepository = this.postgres.getRepository(entities.Bundle);
    const results = await bundleRepository.insert(
      proposalEvents.map((event) =>
        bundleRepository.create({
          poolRebalanceRoot: event.poolRebalanceRoot,
          relayerRefundRoot: event.relayerRefundRoot,
          slowRelayRoot: event.slowRelayRoot,
          proposalId: event.id,
          status: entities.BundleStatus.Proposed, // Default to proposed status
        }),
      ),
    );
    return results.identifiers.length;
  }

  public async associateEventsToBundle(
    events: (
      | {
          bundleId: number;
          eventId: number;
        }
      | undefined
    )[],
    eventType: "canceled" | "disputed",
  ): Promise<number> {
    const dbValues = {
      canceled: {
        dbKey: "cancelationId",
        dbStatus: entities.BundleStatus.Canceled,
      },
      disputed: {
        dbKey: "disputeId",
        dbStatus: entities.BundleStatus.Disputed,
      },
    };
    const { dbKey, dbStatus } = dbValues[eventType];
    const bundleRepository = this.postgres.getRepository(entities.Bundle);

    const results = await Promise.all(
      events.map((event) => {
        if (!event) {
          return undefined;
        }
        return bundleRepository.update(
          {
            id: event.bundleId,
          },
          {
            [dbKey]: { id: event.eventId },
            status: dbStatus,
          },
        );
      }),
    );
    return results.filter((x) => x).length;
  }

  public associateBlockRangeWithBundle(ranges: BlockRangeInsertType[]) {
    return this.postgres
      .getRepository(entities.BundleBlockRange)
      .createQueryBuilder()
      .insert()
      .values(ranges)
      .execute();
  }
}
