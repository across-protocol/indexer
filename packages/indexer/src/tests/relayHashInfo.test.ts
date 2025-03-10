import { expect } from "chai";
import winston from "winston";
import {
  createDataSource,
  Repository,
  entities,
  fixtures,
} from "@repo/indexer-database";
import { parsePostgresConfig } from "../parseEnv";
import { SpokePoolProcessor } from "../services/spokePoolProcessor";

describe("Test relay hash info aggregation and relay status updates", () => {
  // Set up
  // Repositories
  let relayHashInfoRepository: Repository<entities.RelayHashInfo>;

  // Fixtures
  let depositsFixture: fixtures.FundsDepositedFixture;
  let fillsFixture: fixtures.FilledRelayFixture;
  let slowFillsFixture: fixtures.RequestedSlowFillFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;

  // Events
  let deposit: entities.V3FundsDeposited;
  let fill: entities.FilledV3Relay;
  let slowFill: entities.RequestedV3SlowFill;

  // Processor
  let spokePoolProcessor: SpokePoolProcessor;

  before(async () => {
    // Connect to database
    const databaseConfig = parsePostgresConfig(process.env);
    const dataSource = await createDataSource(databaseConfig).initialize();

    // Instantiate repositories
    relayHashInfoRepository = dataSource.getRepository(entities.RelayHashInfo);

    // Instantiate fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    fillsFixture = new fixtures.FilledRelayFixture(dataSource);
    slowFillsFixture = new fixtures.RequestedSlowFillFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);

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
      winston.createLogger({
        transports: [new winston.transports.Console()],
      }),
    );
  });

  afterEach(async () => {
    // Start each test with an empty relayHashInfo table
    await relayHashInfoFixture.deleteAllRelayHashInfoRows();
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
});
