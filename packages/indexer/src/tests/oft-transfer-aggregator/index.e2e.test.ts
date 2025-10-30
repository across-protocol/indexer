import { expect } from "chai";
import { CHAIN_IDs } from "@across-protocol/constants";
import {
  createDataSource,
  DataSource,
  entities,
  fixtures,
} from "@repo/indexer-database";
import { parsePostgresConfig } from "../../parseEnv";
import { OftTransferAggregator } from "../../data-indexing/service/OftTransferAggregator";
import { getOftChainConfiguration } from "../../data-indexing/adapter/oft/service";

describe("OftTransferAggregator", () => {
  // DataSource
  let dataSource: DataSource;

  // Fixtures
  let oftSentFixture: fixtures.OftSentFixture;
  let oftReceivedFixture: fixtures.OftReceivedFixture;
  let oftTransferFixture: fixtures.OftTransferFixture;

  // Aggregator
  let oftTransferAggregator: OftTransferAggregator;

  // Default OFTReceived configuration
  const defaultOftReceivedConfig = {
    token: getOftChainConfiguration(CHAIN_IDs.MAINNET).tokens[0]!.address,
    chainId: CHAIN_IDs.MAINNET.toString(),
    srcEid: getOftChainConfiguration(CHAIN_IDs.POLYGON).endpointId,
  };

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
  it("1.1. should create new OFT transfer when new OFTSent event is added", async () => {
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

  // Test 1.2: Multiple OFTSent Events with Different GUIDs
  // When multiple OFTSent events with different GUIDs are processed,
  // then each should create a separate OftTransfer row
  it("1.2. should create separate OFT transfers when multiple OFTSent events with different GUIDs are added", async () => {
    const oftSentEvents = await oftSentFixture.insertOftSentEvents([
      {},
      {},
      {},
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      oftSentEvents,
      [],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(3);
    oftTransfers.forEach((transfer) => {
      expect(transfer.status).to.equal("unfilled");
      expect(transfer.oftSentEventId).to.not.be.null;
    });
  });

  // Test 1.3: OFTSent Event with Existing GUID (Different Event ID)
  // When a new OFTSent event with same GUID but different event ID is added,
  // then the existing OftTransfer should be updated
  it("1.3. should update existing OFT transfer when OFTSent event with same GUID but different event ID is added", async () => {
    const sharedGuid = "0x123abc";
    const [firstEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [firstEvent!],
      [],
      1,
    );

    const [secondEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [secondEvent!],
      [],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(secondEvent!.id);
  });

  // Test 1.4: OFTSent Event with Existing GUID (Same Event ID)
  // When the same OFTSent event is processed again,
  // then no update should occur (no-op)
  it("1.4. should not update OFT transfer when same OFTSent event is processed again", async () => {
    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents();
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [],
      1,
    );
    let transfersAfter = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(transfersAfter[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [],
      1,
    );
    transfersAfter = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(transfersAfter[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
  });

  // Test 2.1: Single OFTReceived Event → New OFT Transfer Created
  // When a new OFTReceived event is added,
  // then a new OftTransfer row should be created with status Filled
  it("2.1. should create new OftTransfer when new OFTReceived event is added", async () => {
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [{ ...defaultOftReceivedConfig }],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(oftReceivedEvent!.guid);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 2.2: Multiple OFTReceived Events with Different GUIDs
  // When multiple OFTReceived events with different GUIDs are processed,
  // then each should create a separate OftTransfer row with status Filled
  it("2.2. should create separate OftTransfers when multiple OFTReceived events with different GUIDs are added", async () => {
    const oftReceivedEvents = await oftReceivedFixture.insertOftReceivedEvents([
      { ...defaultOftReceivedConfig },
      { ...defaultOftReceivedConfig },
      { ...defaultOftReceivedConfig },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      oftReceivedEvents,
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(3);
    oftTransfers.forEach((transfer) => {
      expect(transfer.status).to.equal("filled");
      expect(transfer.oftReceivedEventId).to.not.be.null;
    });
  });

  // Test 2.3: OFTReceived Event with Existing GUID (Different Event ID)
  // When a new OFTReceived event with same GUID but different event ID is added,
  // then the existing OftTransfer should be updated
  it("2.3. should update existing OFT transfer when OFTReceived event with same GUID but different event ID is added", async () => {
    const sharedGuid = "0xabc123";
    const [firstEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      {
        ...defaultOftReceivedConfig,
        guid: sharedGuid,
      },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [firstEvent!],
      1,
    );

    const [secondEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      {
        ...defaultOftReceivedConfig,
        guid: sharedGuid,
      },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [secondEvent!],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(secondEvent!.id);
  });

  // Test 2.4: OFTReceived Event with Existing GUID (Same Event ID)
  // When the same OFTReceived event is processed again,
  // then no update should occur (no-op)
  it("2.4. should not update OFT transfer when same OFTReceived event is processed again", async () => {
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [{ ...defaultOftReceivedConfig }],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );
    let transfersAfter = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(transfersAfter[0]!.oftReceivedEventId).to.equal(
      oftReceivedEvent!.id,
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );
    transfersAfter = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(transfersAfter[0]!.oftReceivedEventId).to.equal(
      oftReceivedEvent!.id,
    );
  });

  // Test 3.1: OFTSent First, Then OFTReceived (Complete Transfer)
  // When OFTReceived event matches existing OFTSent event,
  // then the OftTransfer should be updated with received data and status changed to Filled
  it("3.1. should update OFT transfer to Filled when OFTReceived event matches existing OFTSent event", async () => {
    const sharedGuid = "0xmatching123";
    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [],
      1,
    );

    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [
        {
          ...defaultOftReceivedConfig,
          guid: sharedGuid,
        },
      ],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 3.2: OFTReceived First, Then OFTSent (Complete Transfer)
  // When OFTSent event matches existing OFTReceived event,
  // then the OftTransfer should be updated with sent data and status remains Filled
  it("3.2. should update OFT transfer with sent data when OFTSent event matches existing OFTReceived event", async () => {
    const sharedGuid = "0xmatching456";
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [
        {
          ...defaultOftReceivedConfig,
          guid: sharedGuid,
        },
      ],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );

    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
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
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 3.3: Both Events Processed Simultaneously
  // When both OFTSent and OFTReceived events with same GUID are processed together,
  // then a single complete OftTransfer should be created with status Filled
  it("3.3. should create single complete OFT transfer when both OFTSent and OFTReceived events are processed simultaneously", async () => {
    const sharedGuid = "0xsimultaneous";
    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [
        {
          ...defaultOftReceivedConfig,
          guid: sharedGuid,
        },
      ],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 4.1: Deleted OFTSent Event (Transfer Has No OFTReceived)
  // When an OFTSent event is deleted and transfer has no OFTReceived event,
  // then the entire OftTransfer row should be deleted
  it("4.1. should delete OFT transfer when OFTSent event is deleted and transfer has no OFTReceived event", async () => {
    let [oftSentEvent] = await oftSentFixture.insertOftSentEvents();
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [],
      1,
    );
    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    oftSentEvent!.deletedAt = new Date();
    oftSentEvent = await dataSource
      .getRepository(entities.OFTSent)
      .save(oftSentEvent!);

    await oftTransferAggregator.processDatabaseEvents(
      [oftSentEvent!],
      [],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 4.2: Deleted OFTSent Event (Transfer Has OFTReceived)
  // When an OFTSent event is deleted but transfer has OFTReceived event,
  // then the OftTransfer should be updated with sent fields nulled
  it("4.2. should update OFT transfer when OFTSent event is deleted and transfer has OFTReceived event", async () => {
    const sharedGuid = "0xdeleted123";
    let [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [
        {
          ...defaultOftReceivedConfig,
          guid: sharedGuid,
        },
      ],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );
    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.status).to.equal("filled");

    oftSentEvent!.deletedAt = new Date();
    oftSentEvent = await dataSource
      .getRepository(entities.OFTSent)
      .save(oftSentEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [oftSentEvent!],
      [],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.be.null;
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.originTxnRef).to.be.null;
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 4.3: Multiple Deleted OFTSent Events
  // When multiple OFTSent events are deleted,
  // then each transfer should be processed correctly
  it("4.3. should process multiple deleted OFTSent events correctly", async () => {
    let oftSentEvents = await oftSentFixture.insertOftSentEvents([{}, {}, {}]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      oftSentEvents,
      [],
      1,
    );

    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(3);

    oftSentEvents = await Promise.all(
      oftSentEvents.map(async (event) => {
        event!.deletedAt = new Date();
        return await dataSource.getRepository(entities.OFTSent).save(event!);
      }),
    );

    await oftTransferAggregator.processDatabaseEvents(
      oftSentEvents,
      [],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 5.1: Deleted OFTReceived Event (Transfer Has No OFTSent)
  // When an OFTReceived event is deleted and transfer has no OFTSent event,
  // then the entire OftTransfer row should be deleted
  it("5.1. should delete OFT transfer when OFTReceived event is deleted and transfer has no OFTSent event", async () => {
    let [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      { ...defaultOftReceivedConfig },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      [oftReceivedEvent!],
      1,
    );
    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);

    oftReceivedEvent!.deletedAt = new Date();
    oftReceivedEvent = await dataSource
      .getRepository(entities.OFTReceived)
      .save(oftReceivedEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [oftReceivedEvent!],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 5.2: Deleted OFTReceived Event (Transfer Has OFTSent)
  // When an OFTReceived event is deleted but transfer has OFTSent event,
  // then the OftTransfer should be updated with received fields nulled and status changed to Unfilled
  it("5.2. should update OFT transfer when OFTReceived event is deleted and transfer has OFTSent event", async () => {
    const sharedGuid = "0xdeleted456";
    const [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    let [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      {
        ...defaultOftReceivedConfig,
        guid: sharedGuid,
      },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );
    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.status).to.equal("filled");

    oftReceivedEvent!.deletedAt = new Date();
    oftReceivedEvent = await dataSource
      .getRepository(entities.OFTReceived)
      .save(oftReceivedEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [oftReceivedEvent!],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.guid).to.equal(sharedGuid);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(oftSentEvent!.id);
    expect(oftTransfers[0]!.oftReceivedEventId).to.be.null;
    expect(oftTransfers[0]!.destinationTxnRef).to.be.null;
    expect(oftTransfers[0]!.status).to.equal("unfilled");
  });

  // Test 5.3: Multiple Deleted OFTReceived Events
  // When multiple OFTReceived events are deleted,
  // then each transfer should be processed correctly
  it("5.3. should process multiple deleted OFTReceived events correctly", async () => {
    let oftReceivedEvents = await oftReceivedFixture.insertOftReceivedEvents([
      { ...defaultOftReceivedConfig },
      { ...defaultOftReceivedConfig },
      { ...defaultOftReceivedConfig },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [],
      oftReceivedEvents,
      1,
    );

    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(3);

    oftReceivedEvents = await Promise.all(
      oftReceivedEvents.map(async (event) => {
        event!.deletedAt = new Date();
        return await dataSource
          .getRepository(entities.OFTReceived)
          .save(event!);
      }),
    );

    await oftTransferAggregator.processDatabaseEvents(
      [],
      oftReceivedEvents,
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 6.1: Sequential Re-Org: Delete Then Re-Add
  // When an OFTSent event is deleted then re-added with same GUID,
  // then the transfer should be updated accordingly through both operations
  it("6.1. should handle sequential re-org when OFTSent event is deleted then re-added", async () => {
    const sharedGuid = "0xreorg123";
    let [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    const [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents(
      [
        {
          ...defaultOftReceivedConfig,
          guid: sharedGuid,
        },
      ],
    );
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );

    oftSentEvent!.deletedAt = new Date();
    oftSentEvent = await dataSource
      .getRepository(entities.OFTSent)
      .save(oftSentEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [oftSentEvent!],
      [],
      [],
      [],
      1,
    );

    const [newOftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [newOftSentEvent!],
      [],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);
    expect(oftTransfers[0]!.oftSentEventId).to.equal(newOftSentEvent!.id);
    expect(oftTransfers[0]!.oftReceivedEventId).to.equal(oftReceivedEvent!.id);
    expect(oftTransfers[0]!.status).to.equal("filled");
  });

  // Test 6.2: Both Events Deleted Sequentially
  // When both OFTSent and OFTReceived events are deleted sequentially,
  // then the transfer should be completely deleted
  it("6.2. should delete transfer when both OFTSent and OFTReceived events are deleted sequentially", async () => {
    const sharedGuid = "0xbothdeleted";
    let [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    let [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      {
        ...defaultOftReceivedConfig,
        guid: sharedGuid,
      },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );

    oftSentEvent!.deletedAt = new Date();
    oftSentEvent = await dataSource
      .getRepository(entities.OFTSent)
      .save(oftSentEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [oftSentEvent!],
      [],
      [],
      [],
      1,
    );

    let oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(1);

    oftReceivedEvent!.deletedAt = new Date();
    oftReceivedEvent = await dataSource
      .getRepository(entities.OFTReceived)
      .save(oftReceivedEvent!);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [oftReceivedEvent!],
      [],
      [],
      1,
    );

    oftTransfers = await dataSource.getRepository(entities.OftTransfer).find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 6.3: Both Events Deleted Simultaneously
  // When both OFTSent and OFTReceived events are deleted in parallel,
  // then the transfer should be completely deleted
  it("6.3. should delete transfer when both OFTSent and OFTReceived events are deleted simultaneously", async () => {
    const sharedGuid = "0xsimuldelete";
    let [oftSentEvent] = await oftSentFixture.insertOftSentEvents([
      { guid: sharedGuid },
    ]);
    let [oftReceivedEvent] = await oftReceivedFixture.insertOftReceivedEvents([
      {
        ...defaultOftReceivedConfig,
        guid: sharedGuid,
      },
    ]);
    await oftTransferAggregator.processDatabaseEvents(
      [],
      [],
      [oftSentEvent!],
      [oftReceivedEvent!],
      1,
    );

    oftSentEvent!.deletedAt = new Date();
    oftSentEvent = await dataSource
      .getRepository(entities.OFTSent)
      .save(oftSentEvent!);
    oftReceivedEvent!.deletedAt = new Date();
    oftReceivedEvent = await dataSource
      .getRepository(entities.OFTReceived)
      .save(oftReceivedEvent!);

    await oftTransferAggregator.processDatabaseEvents(
      [oftSentEvent!],
      [oftReceivedEvent!],
      [],
      [],
      1,
    );

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(0);
  });

  // Test 7.1: Empty Input Arrays
  // When processDatabaseEvents is called with all empty arrays,
  // then no errors should occur and database should remain unchanged
  it("7.1. should handle empty input arrays without errors", async () => {
    await oftTransferAggregator.processDatabaseEvents([], [], [], [], 1);

    const oftTransfers = await dataSource
      .getRepository(entities.OftTransfer)
      .find();
    expect(oftTransfers).to.have.length(0);
  });
});
