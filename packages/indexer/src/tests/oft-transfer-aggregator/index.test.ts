import { expect } from "chai";
import {
  createDataSource,
  DataSource,
  entities,
  fixtures,
} from "@repo/indexer-database";
import { parsePostgresConfig } from "../../parseEnv";
import { OftTransferAggregator } from "../../data-indexing/service/OftTransferAggregator";

describe("OftTransferAggregator", () => {
  // DataSource
  let dataSource: DataSource;

  // Fixtures
  let oftSentFixture: fixtures.OftSentFixture;
  let oftReceivedFixture: fixtures.OftReceivedFixture;
  let oftTransferFixture: fixtures.OftTransferFixture;

  // Aggregator
  let oftTransferAggregator: OftTransferAggregator;

  before(async () => {
    // Connect to database
    const databaseConfig = parsePostgresConfig(process.env);
    dataSource = await createDataSource(databaseConfig).initialize();

    // Instantiate fixtures
    oftSentFixture = new fixtures.OftSentFixture(dataSource);
    oftReceivedFixture = new fixtures.OftReceivedFixture(dataSource);
    oftTransferFixture = new fixtures.OftTransferFixture(dataSource);

    // Instantiate aggregator
    oftTransferAggregator = new OftTransferAggregator(dataSource);
  });

  beforeEach(async () => {
    await oftTransferFixture.deleteAllOftTransfers();
    await oftSentFixture.deleteAllOftSentEvents();
    await oftReceivedFixture.deleteAllOftReceivedEvents();
  });

  afterEach(async () => {
    await oftTransferFixture.deleteAllOftTransfers();
    await oftSentFixture.deleteAllOftSentEvents();
    await oftReceivedFixture.deleteAllOftReceivedEvents();
  });

  after(async () => {});

  // Test 1.1: Single OFTSent Event → New OFT Transfer Created
  // Given an empty database, when new OFTSent event is added,
  // then a new OftTransfer row should be created with the sent event's data
  it("should create new OFT transfer when new OFTSent event is added", async () => {
    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents();
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(oftSentEvent!.guid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("unfilled");
  });
});
