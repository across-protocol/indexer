import winston from "winston";
import { DataSource, entities, utils } from "@repo/indexer-database";

export type BlockRangeInsertType = {
  bundleId: number;
  chainId: number;
  startBlock: number;
  endBlock: number;
};

/**
 * A convenience type for picking the id, block number, transaction hash, log index, and transaction index from a given type.
 */
export type PickRangeType<
  T extends {
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
    transactionIndex: number;
    id: number;
  },
> = Pick<
  T,
  "blockNumber" | "transactionHash" | "logIndex" | "transactionIndex" | "id"
>;

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
    PickRangeType<entities.RootBundleCanceled>[]
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
    PickRangeType<entities.RootBundleDisputed>[]
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

  /**
   * Retrieves all proposed root bundle events that haven't been associated to a bundle relation yet.
   * @returns A list of partial proposed root bundle entities
   */
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

  /**
   * Retrieves all bundles that don't have block ranges defined.
   * @returns A list of partial bundle entities that include the bundle ID and proposal
   */
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
      .orderBy("proposal.blockNumber", "ASC")
      .limit(1000) // Limit to 1000 bundles to process at a time
      .getMany();
  }

  /**
   * Retrieves all root bundle executed events that haven't been associated to a bundle relation yet.
   * @returns A list of partial executed root bundle entities that include the block number,
   *          transaction hash, log index, and transaction index
   */
  public retrieveUnassociatedRootBundleExecutedEvents(): Promise<
    PickRangeType<entities.RootBundleExecuted>[]
  > {
    return this.postgres
      .getRepository(entities.RootBundleExecuted)
      .createQueryBuilder("rbe")
      .leftJoin(
        entities.RootBundleExecutedJoinTable,
        "be",
        "be.executionId = rbe.id",
      )
      .select([
        "rbe.id",
        "rbe.blockNumber",
        "rbe.logIndex",
        "rbe.transactionIndex",
      ])
      .where("be.executionId IS NULL")
      .orderBy("rbe.blockNumber", "ASC")
      .limit(100) // Primarily for initial filling
      .getMany();
  }

  /**
   * Retrieves the closest proposed root bundle to the given block number, transaction index, and log index. The
   * proposed root bundle can be no further back than the given max lookback from the provided block number.
   * @param blockNumber The block number to search from
   * @param transactionIndex The transaction index in the block to search from
   * @param logIndex The log index in the transaction to search from
   * @param maxLookbackFromBlock The maximum number of blocks to look back from the provided block number (optional)
   * @returns The closest proposed (undisputed/non-canceled) root bundle back in time, or undefined if none are found
   */
  public retrieveClosestProposedRootBundleEvent(
    blockNumber: number,
    transactionIndex: number,
    logIndex: number,
    maxLookbackFromBlock?: number,
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
          // If maxLookbackFromBlock is undefined, then allow the full range of blocks to be searched
          blockDiff:
            maxLookbackFromBlock !== undefined
              ? blockNumber - maxLookbackFromBlock
              : 0,
        },
      )
      .orderBy("prb.blockNumber", "DESC") // Grab the most recent proposal
      .getOne();
  }

  /**
   * Retrieves the most recent bundle with the given status. Optionally, the bundle can
   * be filtered by a block number. Note: this is a stored bundle from the "Bundle" table
   * that has already been associated with a proposal.
   * @param status The status of the bundle to retrieve
   * @param blockNumber The block number to filter by (optional)
   * @param nthBundle The nth bundle to retrieve (optional) defaults to 0 (most recent)
   * @returns The most recent nth bundle with the given status, or null if none are found
   */
  public retrieveMostRecentBundle(
    status: entities.BundleStatus,
    blockNumber?: number,
    nthBundle?: number,
  ): Promise<entities.Bundle | null> {
    const queryBuilder = this.postgres
      .getRepository(entities.Bundle)
      .createQueryBuilder("b")
      .leftJoinAndSelect("b.proposal", "proposal")
      .where("b.status = :status", { status });
    if (blockNumber) {
      queryBuilder.andWhere("proposal.blockNumber < :blockNumber", {
        blockNumber,
      });
    }
    queryBuilder.orderBy("proposal.blockNumber", "DESC");
    if (nthBundle !== undefined) {
      queryBuilder.offset(nthBundle);
    }
    return queryBuilder.getOne();
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

  /**
   * A helper function to associate disputes/cancelations with bundles.
   * @param events A list of mappings between bundle IDs and event IDs
   * @param eventType The type of event to associate
   * @returns The number of events associated with bundles
   */
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

  /**
   * Associates a bundle with a block range.
   * @param ranges A list of block ranges to associate with a bundle
   * @returns The result of the inserts
   */
  public associateBlockRangeWithBundle(ranges: BlockRangeInsertType[]) {
    return this.postgres
      .getRepository(entities.BundleBlockRange)
      .createQueryBuilder()
      .insert()
      .values(ranges)
      .execute();
  }

  /**
   * Associates root bundle executed events with a bundle.
   * @param events A list of mappings between bundle IDs and event IDs
   * @returns The result of the inserts
   */
  public async associateRootBundleExecutedEventsToBundle(
    events: {
      bundleId: number;
      executionId: number;
    }[],
  ) {
    return this.postgres
      .getRepository(entities.RootBundleExecutedJoinTable)
      .createQueryBuilder()
      .insert()
      .values(events)
      .execute();
  }

  /**
   * Dynamically updates all proposed bundles to executed status if they have the same number of executions as leaf nodes.
   * @returns The number of bundles updated
   */
  public async updateBundleExecutedStatus(): Promise<number> {
    const bundleRepo = this.postgres.getRepository(entities.Bundle);

    // Define subqueries for execution count and leaf count
    const executionCountSubquery = `(SELECT COUNT(executions."executionId")
      FROM bundle_executions executions
      WHERE executions."bundleId" = bundle.id)`;

    const leafCountSubquery = `(SELECT proposal."poolRebalanceLeafCount"
      FROM "evm"."proposed_root_bundle" proposal
      WHERE proposal."id" = bundle."proposalId"
      LIMIT 1)`;

    const executedUpdateQuery = bundleRepo
      .createQueryBuilder("bundle")
      .update(entities.Bundle)
      .set({ status: entities.BundleStatus.Executed })
      .where("bundle.status IN (:...statuses)", {
        statuses: [entities.BundleStatus.Proposed],
      })
      .andWhere(`${executionCountSubquery} = ${leafCountSubquery}`);

    return (await executedUpdateQuery.execute())?.affected ?? 0;
  }
}
