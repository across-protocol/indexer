import {
  Bundle,
  BundleStatus,
  ProposedRootBundle,
  RelayedRootBundle,
  ExecutedRelayerRefundRoot,
  BundleEvent,
  BundleEventType,
} from "../entities";
import { DataSource, Repository } from "typeorm";

/**
 * Utility class for creating bundle related events and entities.
 * Events supported:
 * - ProposedRootBundle
 * - RelayedRootBundle
 * - ExecutedRelayerRefundRoot
 * - BundleEvent
 * Entities supported:
 * - Bundle
 * Important: When creating entities with foreign key relationships,
 * the referenced entities must already exist in the database.
 * Example: Creating a Bundle requires an existing ProposedRootBundle ID.
 */
export class BundleFixture {
  private bundleRepository: Repository<Bundle>;
  public constructor(private dataSource: DataSource) {
    this.bundleRepository = this.dataSource.getRepository(Bundle);
  }

  /**
   * Creates a mock ProposedRootBundle with default values
   * @param overrides - Partial object to override default values
   * @returns Mock ProposedRootBundle object with default and overridden values
   */
  public mockBundleProposal(overrides: Partial<ProposedRootBundle>) {
    return {
      challengePeriodEndTimestamp: new Date(),
      poolRebalanceLeafCount: 1,
      bundleEvaluationBlockNumbers: [10, 20, 30],
      chainIds: [1, 2, 3],
      poolRebalanceRoot: "0xPoolRebalanceRoot",
      relayerRefundRoot: "0xRelayerRefundRoot",
      slowRelayRoot: "0xSlowRelayRoot",
      proposer: "0xProposer",
      transactionHash: "0xabc",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1,
      finalised: true,
      ...overrides,
    };
  }

  /**
   * Inserts one or more ProposedRootBundle records into the database
   * @param proposals - Array of partial ProposedRootBundle objects to insert
   * @returns Array of inserted ProposedRootBundle objects
   */
  public async insertBundleProposals(proposals: Partial<ProposedRootBundle>[]) {
    if (proposals.length === 0) {
      proposals.push(this.mockBundleProposal({}));
    }
    const result = await this.dataSource
      .getRepository(ProposedRootBundle)
      .createQueryBuilder()
      .insert()
      .values(proposals.map((proposal) => this.mockBundleProposal(proposal)))
      .returning("*")
      .execute();
    return result.generatedMaps as [
      ProposedRootBundle,
      ...ProposedRootBundle[],
    ];
  }

  /**
   * Creates a mock Bundle object with default values
   * Requires an existing ProposedRootBundle in the database.
   * @param proposalId - ID of the associated ProposedRootBundle to link with this bundle
   * @param overrides - Partial object to override default values of the Bundle
   * @returns Promise<Bundle> - Mock Bundle object with values from the proposal and any overrides
   * @throws Error if the ProposedRootBundle with the given ID is not found
   */
  public async mockBundle(proposalId: number, overrides: Partial<Bundle>) {
    const proposal = await this.dataSource
      .getRepository(ProposedRootBundle)
      .findOne({ where: { id: proposalId } });
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    return {
      poolRebalanceRoot: proposal.poolRebalanceRoot,
      relayerRefundRoot: proposal.relayerRefundRoot,
      slowRelayRoot: proposal.slowRelayRoot,
      proposalId: proposalId,
      status: BundleStatus.Executed,
      eventsAssociated: true,
      ...overrides,
    };
  }

  /**
   * Inserts a Bundle record into the database
   * @param proposalId - ID of the associated ProposedRootBundle
   * @param bundle - Partial Bundle object to insert
   * @returns Saved Bundle object
   */
  public async insertBundle(proposalId: number, bundle: Partial<Bundle>) {
    const result = await this.bundleRepository
      .createQueryBuilder()
      .insert()
      .values(await this.mockBundle(proposalId, bundle))
      .returning("*")
      .execute();
    const savedBundle = result.generatedMaps[0] as Bundle;
    return savedBundle;
  }

  /**
   * Creates a mock RelayedRootBundle with default values
   * @param overrides - Partial object to override default values
   * @returns Mock RelayedRootBundle object with default and overridden values
   */
  public mockRelayedRootBundle(overrides: Partial<RelayedRootBundle>) {
    return {
      chainId: 1,
      rootBundleId: 1,
      relayerRefundRoot: "0xRelayerRefundRoot",
      slowRelayRoot: "0xSlowRelayRoot",
      transactionHash: "0xabc",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1,
      finalised: true,
      ...overrides,
    };
  }

  /**
   * Inserts one or more RelayedRootBundle records into the database
   * @param relayedRootBundles - Array of partial RelayedRootBundle objects to insert
   * @returns Array of inserted RelayedRootBundle
   */
  public async insertRelayedRootBundle(
    relayedRootBundles: Partial<RelayedRootBundle>[],
  ) {
    if (relayedRootBundles.length === 0) {
      relayedRootBundles.push(this.mockRelayedRootBundle({}));
    }
    const result = await this.dataSource
      .getRepository(RelayedRootBundle)
      .createQueryBuilder()
      .insert()
      .values(
        relayedRootBundles.map((relayedRootBundle) =>
          this.mockRelayedRootBundle(relayedRootBundle),
        ),
      )
      .returning("*")
      .execute();
    return result.generatedMaps as RelayedRootBundle[];
  }

  /**
   * Creates a mock ExecutedRelayerRefundRoot with default values
   * @param overrides - Partial object to override default values
   * @returns Mock ExecutedRelayerRefundRoot object with default and overridden values
   */
  public mockExecutedRelayerRefundRoot(
    overrides: Partial<ExecutedRelayerRefundRoot>,
  ) {
    return {
      chainId: 1,
      rootBundleId: 1,
      leafId: 1,
      l2TokenAddress: "0xL2TokenAddress",
      amountToReturn: "10",
      refundAmounts: ["10"],
      refundAddresses: ["0xrefund1"],
      deferredRefunds: false,
      caller: "0x123",
      transactionHash: "0xabc",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1,
      finalised: true,
      ...overrides,
    };
  }

  /**
   * Inserts one or more ExecutedRelayerRefundRoot records into the database
   * @param executedRelayerRefundRoots - Array of partial ExecutedRelayerRefundRoot objects to insert
   * @returns Array of inserted ExecutedRelayerRefundRoot objects
   */
  public async insertExecutedRelayerRefundRoot(
    executedRelayerRefundRoots: Partial<ExecutedRelayerRefundRoot>[],
  ) {
    if (executedRelayerRefundRoots.length === 0) {
      executedRelayerRefundRoots.push(this.mockExecutedRelayerRefundRoot({}));
    }
    const result = await this.dataSource
      .getRepository(ExecutedRelayerRefundRoot)
      .createQueryBuilder()
      .insert()
      .values(
        executedRelayerRefundRoots.map((executedRelayerRefundRoot) =>
          this.mockExecutedRelayerRefundRoot(executedRelayerRefundRoot),
        ),
      )
      .returning("*")
      .execute();
    return result.generatedMaps as ExecutedRelayerRefundRoot[];
  }

  /**
   * Creates a mock BundleEvent with default values
   * Requires an existing Bundle in the database.
   * @param bundleId - ID of the associated Bundle
   * @param overrides - Partial object to override default values
   * @returns Mock BundleEvent object with default and overridden values
   * @throws Error if the Bundle with the given ID is not found
   */
  public async mockBundleEvents(
    bundleId: number,
    overrides: Partial<BundleEvent>,
  ) {
    const bundle = await this.bundleRepository.findOne({
      where: { id: bundleId },
    });
    if (!bundle) {
      throw new Error("Bundle not found");
    }
    return {
      bundleId: bundleId,
      type: BundleEventType.Deposit,
      relayHash: "0xaaa",
      repaymentChainId: "1",
      eventChainId: 1,
      eventBlockNumber: 1,
      eventLogIndex: 1,
      ...overrides,
    };
  }

  /**
   * Inserts one or more BundleEvent records into the database
   * @param bundleId - ID of the associated Bundle
   * @param events - Array of partial BundleEvent objects to insert
   * @returns Array of inserted BundleEvent objects
   */
  public async insertBundleEvents(
    bundleId: number,
    events: Partial<BundleEvent>[],
  ) {
    if (events.length === 0) {
      events.push(await this.mockBundleEvents(bundleId, {}));
    }
    const mockedRows = await Promise.all(
      events.map(async (event) => await this.mockBundleEvents(bundleId, event)),
    );
    const result = await this.dataSource
      .getRepository(BundleEvent)
      .createQueryBuilder()
      .insert()
      .values(mockedRows)
      .returning("*")
      .execute();
    return result.generatedMaps as BundleEvent[];
  }

  /**
   * Cleans up all bundle-related tables by truncating them
   */
  public async cleanUpBundleEvents() {
    await this.dataSource.query(
      `truncate table bundle_event restart identity cascade`,
    );
    await this.dataSource.query(
      `truncate table "evm"."executed_relayer_refund_root" restart identity cascade`,
    );
    await this.dataSource.query(
      `truncate table "evm"."relayed_root_bundle" restart identity cascade`,
    );
    await this.dataSource.query(
      `truncate table bundle restart identity cascade`,
    );
    await this.dataSource.query(
      `truncate table "evm"."proposed_root_bundle" restart identity cascade`,
    );
  }
}
