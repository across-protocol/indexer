import { expect } from "chai";
import winston from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import {
  createDataSource,
  DataSource,
  Repository,
  entities,
  fixtures,
} from "@repo/indexer-database";
import { utils, arch, interfaces } from "@across-protocol/sdk";
import { parsePostgresConfig } from "../parseEnv";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { SpokePoolProcessor } from "../services/spokePoolProcessor";
import { RefundedDepositsStatusService } from "../services/RefundedDepositsStatusService";

describe("RelayHashInfo Tests", () => {
  // Set up
  // Tests logger
  const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
  });

  // DataSource
  let dataSource: DataSource;

  // Repositories
  let relayHashInfoRepository: Repository<entities.RelayHashInfo>;
  let spokePoolRepository: SpokePoolRepository;

  // Fixtures
  let depositsFixture: fixtures.FundsDepositedFixture;
  let fillsFixture: fixtures.FilledRelayFixture;
  let slowFillsFixture: fixtures.RequestedSlowFillFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;
  let bundleFixture: fixtures.BundleFixture;

  // Events
  let deposit: entities.V3FundsDeposited;
  let fill: entities.FilledV3Relay;
  let slowFill: entities.RequestedV3SlowFill;

  // Processor
  let spokePoolProcessor: SpokePoolProcessor;

  let refundedDepositsStatusService: RefundedDepositsStatusService;

  before(async () => {
    // Connect to database
    const databaseConfig = parsePostgresConfig(process.env);
    dataSource = await createDataSource(databaseConfig).initialize();

    // Instantiate repositories
    relayHashInfoRepository = dataSource.getRepository(entities.RelayHashInfo);
    spokePoolRepository = new SpokePoolRepository(dataSource, logger);

    // Instantiate fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    fillsFixture = new fixtures.FilledRelayFixture(dataSource);
    slowFillsFixture = new fixtures.RequestedSlowFillFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);
    bundleFixture = new fixtures.BundleFixture(dataSource);

    // Store events to use across tests
    [deposit] = await depositsFixture.insertDeposits([
      { internalHash: "0x123" },
    ]);
    [fill] = await fillsFixture.insertFills([{ internalHash: "0x123" }]);
    [slowFill] = await slowFillsFixture.insertRequestedSlowFills([
      { internalHash: "0x123" },
    ]);

    // Initialize SpokePoolProcessor
    spokePoolProcessor = new SpokePoolProcessor(
      dataSource,
      1, // ChainId - for simplicity we'll use the same processor for all tests
      logger,
    );

    refundedDepositsStatusService = new RefundedDepositsStatusService(
      logger,
      dataSource,
    );
  });

  afterEach(async () => {
    // Start each test with an empty relayHashInfo table
    await relayHashInfoFixture.deleteAllRelayHashInfoRows();
    // also delete bundle events
    await bundleFixture.cleanUpBundleEvents();
  });

  after(async () => {
    // Clean up db after all tests
    await depositsFixture.deleteAllDeposits();
    await fillsFixture.deleteAllFilledRelays();
    await slowFillsFixture.deleteAllRequestedSlowFills();
  });

  it("should update relayHashInfo when deposit is filled", async () => {
    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Verify initial relayHashInfo state
    const initialRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(initialRelayHashInfo).to.not.be.null;
    expect(initialRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Unfilled,
    );
    expect(initialRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(initialRelayHashInfo!.fillEventId).to.be.null;

    // Process fill to update relayHashInfo
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [],
      fills: [fill],
      slowFillRequests: [],
    });

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    expect(updatedRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(updatedRelayHashInfo!.fillEventId).to.equal(fill.id);
  });

  it("should keep status as filled when a deposit is stored after a fill", async () => {
    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [],
      fills: [fill],
      slowFillRequests: [],
    });

    // Verify initial relayHashInfo state
    const initialRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(initialRelayHashInfo).to.not.be.null;
    expect(initialRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    expect(initialRelayHashInfo!.depositEventId).to.be.null;
    expect(initialRelayHashInfo!.fillEventId).to.equal(fill.id);

    // Process fill to update relayHashInfo
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    expect(updatedRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(updatedRelayHashInfo!.fillEventId).to.equal(fill.id);
  });

  it("should update RelayHashInfo to slowFillRequested then filled", async () => {
    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Verify initial relayHashInfo state
    const initialRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(initialRelayHashInfo).to.not.be.null;
    expect(initialRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Unfilled,
    );
    expect(initialRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(initialRelayHashInfo!.fillEventId).to.be.null;

    // Process slowFillRequest to update relayHashInfo
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [],
      fills: [],
      slowFillRequests: [slowFill],
    });

    // Verify intermediate relayHashInfo state
    const intermediateRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(intermediateRelayHashInfo).to.not.be.null;
    expect(intermediateRelayHashInfo!.status).to.equal(
      entities.RelayStatus.SlowFillRequested,
    );
    expect(intermediateRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(intermediateRelayHashInfo!.slowFillRequestEventId).to.equal(
      slowFill.id,
    );
    expect(intermediateRelayHashInfo!.fillEventId).to.be.null;

    // Process fill to update relayHashInfo
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [],
      fills: [fill],
      slowFillRequests: [],
    });

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    expect(updatedRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(updatedRelayHashInfo!.fillEventId).to.equal(fill.id);
    expect(updatedRelayHashInfo!.slowFillRequestEventId).to.equal(slowFill.id);
  });

  it("should update RelayHashInfo status to Expired when deposit expires", async () => {
    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Verify initial relayHashInfo state
    const initialRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(initialRelayHashInfo).to.not.be.null;
    expect(initialRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Unfilled,
    );
    expect(initialRelayHashInfo!.depositEventId).to.equal(deposit.id);

    // As the deposit was created using now() as the fill deadline, it should be expired
    await spokePoolProcessor.updateExpiredRelays();

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(entities.RelayStatus.Expired);
  });

  it("should update relayHashInfo with fill reference and status filled even after deposit expiry", async () => {
    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Verify initial relayHashInfo state
    const initialRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(initialRelayHashInfo).to.not.be.null;
    expect(initialRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Unfilled,
    );
    expect(initialRelayHashInfo!.depositEventId).to.equal(deposit.id);

    // Deposit expires
    await spokePoolProcessor.updateExpiredRelays();

    // Verify intermediate relayHashInfo state
    const intermediateRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(intermediateRelayHashInfo).to.not.be.null;
    expect(intermediateRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Expired,
    );

    // Process fill to update relayHashInfo
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [],
      fills: [fill],
      slowFillRequests: [],
    });

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: "0x123" },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    expect(updatedRelayHashInfo!.fillEventId).to.equal(fill.id);
  });

  it("should update relayHashInfo status to refunded and set depositRefundTxHash when a refund is found", async () => {
    // set up bundle related events
    const [proposal] = await bundleFixture.insertBundleProposals([]);
    const bundle = await bundleFixture.insertBundle(proposal.id, {});
    const [relayedRootBundle] = await bundleFixture.insertRelayedRootBundle([
      {
        relayerRefundRoot: proposal.relayerRefundRoot,
        slowRelayRoot: proposal.slowRelayRoot,
      },
    ]);
    const [executedRelayerRefundRoot] =
      await bundleFixture.insertExecutedRelayerRefundRoot([
        {
          rootBundleId: relayedRootBundle!.rootBundleId,
        },
      ]);

    // Process deposit to create initial relayHashInfo row
    await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
      deposits: [deposit],
      fills: [],
      slowFillRequests: [],
    });

    // Issue a refund for deposit
    await bundleFixture.insertBundleEvents(bundle.id, [
      {
        bundleId: bundle.id,
        type: entities.BundleEventType.ExpiredDeposit,
        relayHash: deposit.internalHash,
        eventChainId: deposit.originChainId,
        eventBlockNumber: deposit.blockNumber,
        eventLogIndex: deposit.logIndex,
      },
    ]);

    // Process refunds
    // for simplicity a single chainId is used in all test cases
    await refundedDepositsStatusService.updateRelayStatusForRefundedDeposits(1);

    // Verify final relayHashInfo state
    const updatedRelayHashInfo = await relayHashInfoRepository.findOne({
      where: { internalHash: deposit.internalHash },
    });
    expect(updatedRelayHashInfo).to.not.be.null;
    expect(updatedRelayHashInfo!.status).to.equal(
      entities.RelayStatus.Refunded,
    );
    expect(updatedRelayHashInfo!.depositEventId).to.equal(deposit.id);
    expect(updatedRelayHashInfo!.depositRefundTxHash).to.equal(
      executedRelayerRefundRoot!.transactionHash,
    );
  });

  describe("Test duplicated deposits handling", () => {
    it("should create a new RelayHashInfo row for a duplicated deposit with the same internalHash", async () => {
      // Process deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [deposit],
        fills: [],
        slowFillRequests: [],
      });

      // Verify initial relayHashInfo state
      const initialRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0x123" },
      });
      expect(initialRelayHashInfo).to.not.be.null;
      expect(initialRelayHashInfo!.depositEventId).to.equal(deposit.id);

      // Create duplicate deposit in different block
      const [duplicatedDeposit] = await depositsFixture.insertDeposits([
        { internalHash: "0x123", blockNumber: 2 },
      ]);

      // Process duplicate deposit
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [duplicatedDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Verify final relayHashInfo state
      const relayRows = await relayHashInfoRepository.find({
        where: { internalHash: "0x123" },
        order: { depositEventId: "ASC" },
      });
      expect(relayRows!).to.have.lengthOf(2);
      expect(relayRows[0]!.depositEventId).to.equal(deposit.id);
      expect(relayRows[1]!.depositEventId).to.equal(duplicatedDeposit.id);
    });

    it("should create a new RelayHashInfo row for a duplicated deposit even after the original is filled", async () => {
      // Create original deposit
      const [originalDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0x456", internalHash: "0x456" },
      ]);

      // Process deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [originalDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Create fill
      const [fill] = await fillsFixture.insertFills([
        { internalHash: "0x456" },
      ]);

      // Process fill to create filled relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [fill],
        slowFillRequests: [],
      });

      // Create duplicate deposit in different block
      const [duplicatedDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0x456", internalHash: "0x456", blockNumber: 2 },
      ]);

      // Process duplicated deposit
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [duplicatedDeposit!],
        fills: [],
        slowFillRequests: [],
      });

      // Verify final relayHashInfo state
      const relayRows = await relayHashInfoRepository.find({
        where: { internalHash: "0x456" },
        order: { depositEventId: "ASC" },
      });
      expect(relayRows!).to.have.lengthOf(2);
      const originalRelay = relayRows[0]!;
      const duplicatedRelay = relayRows[1]!;
      expect(originalRelay.depositEventId).to.equal(originalDeposit.id);
      expect(originalRelay.fillEventId).to.equal(fill.id);
      expect(originalRelay.status).to.equal(entities.RelayStatus.Filled);
      expect(duplicatedRelay.depositEventId).to.equal(duplicatedDeposit!.id);
      expect(duplicatedRelay.fillEventId).to.be.null;
      expect(duplicatedRelay.status).to.equal(entities.RelayStatus.Unfilled);
    });

    it("should create two unfilled RelayHashInfo rows for duplicated deposits and then fill the first one", async () => {
      // Create original deposit
      const [originalDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0xabc", internalHash: "0xabc" },
      ]);

      // Process original deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [originalDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Create duplicate deposit
      const [duplicatedDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0xabc", internalHash: "0xabc", blockNumber: 2 },
      ]);

      // Process duplicated deposit
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [duplicatedDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Create fill
      const [fill] = await fillsFixture.insertFills([
        { internalHash: "0xabc" },
      ]);

      // Process fill to update original relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [fill],
        slowFillRequests: [],
      });

      // Verify final relayHashInfo state
      const relayRows = await relayHashInfoRepository.find({
        where: { internalHash: "0xabc" },
        order: { depositEventId: "ASC" },
      });
      expect(relayRows!).to.have.lengthOf(2);
      const originalRelay = relayRows[0]!;
      const duplicatedRelay = relayRows[1]!;
      expect(originalRelay.depositEventId).to.equal(originalDeposit.id);
      expect(originalRelay.fillEventId).to.equal(fill.id);
      expect(originalRelay.status).to.equal(entities.RelayStatus.Filled);
      expect(duplicatedRelay.depositEventId).to.equal(duplicatedDeposit.id);
      expect(duplicatedRelay.fillEventId).to.be.null;
      expect(duplicatedRelay.status).to.equal(entities.RelayStatus.Unfilled);
    });
  });

  describe("Test deleted deposits handling", () => {
    it("should delete RelayHashInfo row when deposit is not finalized and no other events exist", async () => {
      // Create deposit
      const [unfinalizedDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0xdef", internalHash: "0xdef", finalised: false },
      ]);

      // Process deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [unfinalizedDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Verify initial relayHashInfo state
      const initialRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0xdef" },
      });
      expect(initialRelayHashInfo).to.not.be.null;

      // Soft delete unfinalized deposit
      const deletedDeposits =
        await spokePoolRepository.deleteUnfinalisedDepositEvents(
          1, // chainId
          unfinalizedDeposit.blockNumber + 1, // lastFinalisedBlock older than deposit block number
        );

      // Process deleted deposit
      await spokePoolProcessor.processDeletedDeposits(deletedDeposits);

      // Verify final relayHashInfo state. Existing row for internalHash should be deleted
      const finalRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0xdef" },
      });
      expect(finalRelayHashInfo).to.be.null;
    });

    it("should remove deposit reference but keep relayHashInfo row when a deposit is not finalised but a fill exists", async () => {
      // Create deposit
      const [unfinalizedDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0x1ab", internalHash: "0x1ab", finalised: false },
      ]);

      // Process deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [unfinalizedDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Create fill
      const [fill] = await fillsFixture.insertFills([
        { internalHash: "0x1ab" },
      ]);

      // Process fill to update relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [fill],
        slowFillRequests: [],
      });

      // Check initial relayHashInfo state
      const initialRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0x1ab" },
      });
      expect(initialRelayHashInfo).to.not.be.null;
      expect(initialRelayHashInfo!.depositEventId).to.equal(
        unfinalizedDeposit.id,
      );
      expect(initialRelayHashInfo!.fillEventId).to.equal(fill.id);
      expect(initialRelayHashInfo!.status).to.equal(
        entities.RelayStatus.Filled,
      );

      // Soft delete unfinalized deposit
      const deletedDeposits =
        await spokePoolRepository.deleteUnfinalisedDepositEvents(
          1, // chainId
          unfinalizedDeposit.blockNumber + 1, // lastFinalisedBlock older than deposit block number
        );

      // Process deleted deposit
      await spokePoolProcessor.processDeletedDeposits(deletedDeposits);

      // Verify final relayHashInfo state. Existing row for internalHash should have its depositEventId removed
      const finalRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0x1ab" },
      });
      expect(finalRelayHashInfo).to.not.be.null;
      expect(finalRelayHashInfo!.depositEventId).to.be.null;
      expect(finalRelayHashInfo!.fillEventId).to.equal(fill.id);
      expect(finalRelayHashInfo!.status).to.equal(entities.RelayStatus.Filled);
    });

    it("should merge relay row data into an existing entry and delete the redundant row when replacing an unfinalized deposit with a new deposit", async () => {
      // Create original deposit
      const [originalDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0x2cd", internalHash: "0x2cd", finalised: false },
      ]);

      // Process original deposit to create initial relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [originalDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Check initial relayHashInfo state
      const initialRelayHashInfo = await relayHashInfoRepository.findOne({
        where: { internalHash: "0x2cd" },
      });
      expect(initialRelayHashInfo).to.not.be.null;

      // Create fill
      const [fill] = await fillsFixture.insertFills([
        { internalHash: "0x2cd" },
      ]);

      // Process fill to update relayHashInfo row
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [],
        fills: [fill],
        slowFillRequests: [],
      });

      // Create duplicate deposit
      const [replacingDeposit] = await depositsFixture.insertDeposits([
        { relayHash: "0x2cd", internalHash: "0x2cd", blockNumber: 2 },
      ]);

      // Process duplicate deposit
      await spokePoolProcessor.assignSpokeEventsToRelayHashInfo({
        deposits: [replacingDeposit],
        fills: [],
        slowFillRequests: [],
      });

      // Check RelayHashInfo state after duplicate deposit is processed and before deleting the unfinalized deposit
      const relayRows = await relayHashInfoRepository.find({
        where: { internalHash: "0x2cd" },
        order: { depositEventId: "ASC" },
      });
      const unfinalizedDeposit = relayRows[0];
      const finalizedDeposit = relayRows[1];
      expect(relayRows).to.not.be.null;
      expect(relayRows).to.have.lengthOf(2);
      expect(unfinalizedDeposit!.depositEventId).to.equal(originalDeposit.id);
      expect(unfinalizedDeposit!.fillEventId).to.equal(fill.id);
      expect(unfinalizedDeposit!.status).to.equal(entities.RelayStatus.Filled);
      expect(finalizedDeposit!.depositEventId).to.equal(replacingDeposit.id);
      expect(finalizedDeposit!.fillEventId).to.be.null;
      expect(finalizedDeposit!.status).to.equal(entities.RelayStatus.Unfilled);

      // Soft delete unfinalized deposit
      const deletedDeposits =
        await spokePoolRepository.deleteUnfinalisedDepositEvents(
          1, // chainId
          originalDeposit.blockNumber + 1, // lastFinalisedBlock older than deposit block number
        );

      // Process deleted deposit
      await spokePoolProcessor.processDeletedDeposits(deletedDeposits);

      // Check RelayHashInfo state after deleting unfinalized deposit
      // Replacing deposit data should be merged into original row
      const relayRowsAfterDeletion = await relayHashInfoRepository.find({
        where: { internalHash: "0x2cd" },
        order: { depositEventId: "ASC" },
      });
      expect(relayRowsAfterDeletion).to.not.be.null;
      expect(relayRowsAfterDeletion).to.have.lengthOf(1);
      const finalRow = relayRowsAfterDeletion[0];
      expect(finalRow!.depositEventId).to.equal(replacingDeposit.id);
      expect(finalRow!.fillEventId).to.equal(fill.id);
      expect(finalRow!.status).to.equal(entities.RelayStatus.Filled);
    });
  });

  describe("Test adress conversions from bytes32 to specific chain format", () => {
    const baseEvent: interfaces.DepositWithBlock = {
      txnRef: "txHash",
      blockNumber: 100,
      txnIndex: 0,
      logIndex: 0,
      inputToken: utils.EvmAddress.from(utils.AddressZero),
      outputToken: utils.EvmAddress.from(utils.AddressZero),
      inputAmount: utils.BigNumber.from("100"),
      outputAmount: utils.BigNumber.from("100"),
      destinationChainId: 1,
      depositId: utils.BigNumber.from("2"),
      quoteTimestamp: 1744657139,
      fillDeadline: 1744660739,
      exclusivityDeadline: 0,
      depositor: utils.EvmAddress.from(utils.AddressZero),
      recipient: utils.EvmAddress.from(utils.AddressZero),
      exclusiveRelayer: utils.EvmAddress.from(utils.AddressZero),
      message: "0x",
      messageHash: "0xmessageHash",
      quoteBlockNumber: 100,
      originChainId: 34268394551451,
      fromLiteChain: false,
      toLiteChain: false,
    };
    it("should handle address conversion correctly. Origin chain is SVM and destination chain is EVM", () => {
      // Copy base event
      const event = {
        ...baseEvent,
      };
      // Set origin chainId as SVM and destination chainId as EVM
      event.originChainId = CHAIN_IDs.SOLANA;
      event.destinationChainId = CHAIN_IDs.MAINNET;
      // Set SVM Origin addresses formatted as Bytes32
      const depositor = arch.svm.getRandomSvmAddress();
      const inputToken = arch.svm.getRandomSvmAddress();
      event.depositor = utils.SvmAddress.from(depositor);
      event.inputToken = utils.SvmAddress.from(inputToken);
      // Set EVM Destination addresses formatted as Bytes32
      const recipient = utils.randomAddress();
      const outputToken = utils.randomAddress();
      const exclusiveRelayer = utils.AddressZero;
      event.recipient = utils.EvmAddress.from(recipient);
      event.outputToken = utils.EvmAddress.from(outputToken);
      event.exclusiveRelayer = utils.EvmAddress.from(exclusiveRelayer);

      // Format event
      const formattedEvent = spokePoolRepository.formatRelayData(event);

      // Verify formatted event
      expect(formattedEvent.depositor).to.equal(depositor);
      expect(formattedEvent.inputToken).to.equal(inputToken);
      expect(formattedEvent.recipient).to.equal(recipient);
      expect(formattedEvent.outputToken).to.equal(outputToken);
      expect(formattedEvent.exclusiveRelayer).to.equal(exclusiveRelayer);
    });

    it("should handle address conversion correctly. Origin chain is EVM and destination chain is SVM", () => {
      // Copy base event
      const event = {
        ...baseEvent,
      };
      // Set origin chainId as EVM and destination chainId as SVM
      event.originChainId = CHAIN_IDs.MAINNET;
      event.destinationChainId = CHAIN_IDs.SOLANA;
      // Set EVM Origin addresses formatted as Bytes32
      const depositor = utils.randomAddress();
      const inputToken = utils.randomAddress();
      event.depositor = utils.EvmAddress.from(depositor);
      event.inputToken = utils.EvmAddress.from(inputToken);
      // Set SVM Destination addresses formatted as Bytes32
      const recipient = arch.svm.getRandomSvmAddress();
      const outputToken = arch.svm.getRandomSvmAddress();
      const exclusiveRelayer = arch.svm.SVM_DEFAULT_ADDRESS;
      event.recipient = utils.SvmAddress.from(recipient);
      event.outputToken = utils.SvmAddress.from(outputToken);
      event.exclusiveRelayer = utils.SvmAddress.from(exclusiveRelayer);

      // Format event
      const formattedEvent = spokePoolRepository.formatRelayData(event);

      // Verify formatted event
      expect(formattedEvent.depositor).to.equal(depositor);
      expect(formattedEvent.inputToken).to.equal(inputToken);
      expect(formattedEvent.recipient).to.equal(recipient);
      expect(formattedEvent.outputToken).to.equal(outputToken);
      expect(formattedEvent.exclusiveRelayer).to.equal(exclusiveRelayer);
    });
  });
});
