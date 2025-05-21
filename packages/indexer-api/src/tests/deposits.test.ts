import { expect } from "chai";
import winston from "winston";
import {
  createDataSource,
  DataSource,
  entities,
  fixtures,
} from "@repo/indexer-database";
// import { parsePostgresConfig } from "../parseEnv";
import { DepositsService } from "../services/deposits"; // Assuming this is the new service file
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";
import * as utils from "../utils";

describe("Deposits Service Tests", () => {
  // Set up
  const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
  });

  let dataSource: DataSource;
  let depositsService: DepositsService;
  let redis: Redis;

  // Fixtures
  let depositsFixture: fixtures.FundsDepositedFixture;
  let fillsFixture: fixtures.FilledRelayFixture;
  let slowFillsFixture: fixtures.RequestedSlowFillFixture;
  let swapBeforeBridgeFixture: fixtures.SwapBeforeBridgeFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;

  // Events
  let deposit: entities.V3FundsDeposited;
  let fill: entities.FilledV3Relay;
  let slowFill: entities.RequestedV3SlowFill;

  before(async () => {
    const databaseConfig = utils.getPostgresConfig(process.env);
    dataSource = await createDataSource(databaseConfig).initialize();

    // Initialize Redis
    const redisConfig = Indexer.parseRedisConfig(process.env);
    redis = new Redis(redisConfig);

    // Instantiate service
    depositsService = new DepositsService(dataSource, redis);

    // Instantiate fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    fillsFixture = new fixtures.FilledRelayFixture(dataSource);
    slowFillsFixture = new fixtures.RequestedSlowFillFixture(dataSource);
    swapBeforeBridgeFixture = new fixtures.SwapBeforeBridgeFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);

    // Store events to use across tests
    [deposit] = await depositsFixture.insertDeposits([
      { internalHash: "0x123" },
    ]);
    [fill] = await fillsFixture.insertFills([{ internalHash: "0x123" }]);
    [slowFill] = await slowFillsFixture.insertRequestedSlowFills([
      { internalHash: "0x123" },
    ]);
  });

  afterEach(async () => {
    // Reset state after each test
    await depositsFixture.deleteAllDeposits();
    await fillsFixture.deleteAllFilledRelays();
    await slowFillsFixture.deleteAllRequestedSlowFills();
    await swapBeforeBridgeFixture.deleteAllSwaps();
    await relayHashInfoFixture.deleteAllRelayHashInfoRows();
  });

  after(async () => {
    // Close connections after all tests
    await dataSource.destroy();
    await redis.quit();
  });

  it("should show the deposits table is empty when calling getDeposits", async () => {
    // Ensure the deposits table is empty
    await depositsFixture.deleteAllDeposits();

    // Call getDeposits to retrieve all deposits
    const deposits = await depositsService.getDeposits({ limit: 1 });

    // Verify that the deposits array is empty
    expect(deposits).to.be.an("array").that.is.empty;
  });
  it("should create a single deposit and verify it exists", async () => {
    // Insert a single deposit
    const [newDeposit] = await depositsFixture.insertDeposits([
      { depositor: "0x456" },
    ]);

    // Call getDeposits to retrieve all deposits
    const deposits = await depositsService.getDeposits({ limit: 10 });

    // Verify that the deposits array contains one deposit
    expect(deposits).to.be.an("array").that.has.lengthOf(1);

    // Verify that the retrieved deposit matches the inserted deposit
    expect(deposits[0]?.depositId).to.equal(newDeposit.depositId);
    expect(deposits[0]?.depositor).to.equal("0x456");
  });
  it("should add 10 deposits and query them in two pages", async () => {
    // Insert 10 deposits
    const depositsData = Array.from({ length: 10 }, (_, i) => ({
      depositor: `0x${(i + 1).toString(16).padStart(3, "0")}`,
      relayHash: `0xrelay${i}`,
      depositId: (i + 1).toString(),
      originChainId: (i + 1).toString(),
      destinationChainId: (i + 2).toString(),
      internalHash: `0xinternal${i}`,
      transactionHash: `0xtransaction${i}`,
      transactionIndex: i,
      logIndex: i,
      blockNumber: i + 1000,
      finalised: i % 2 === 0,
      createdAt: new Date(),
      blockTimestamp: new Date(Date.now() - i * 1000),
    }));
    const insertedDeposits = await depositsFixture.insertDeposits(depositsData);

    // Query the first page (0-4)
    const firstPageDeposits = await depositsService.getDeposits({
      limit: 5,
      skip: 0,
    });

    // Verify that the first page contains 5 deposits
    expect(firstPageDeposits).to.be.an("array").that.has.lengthOf(5);

    // Verify that the retrieved deposits match the inserted deposits for the first page
    for (let i = 0; i < 5; i++) {
      expect(firstPageDeposits[i]?.depositId).to.equal(
        insertedDeposits[i]?.depositId,
      );
      expect(firstPageDeposits[i]?.depositor).to.equal(
        depositsData[i]?.depositor,
      );
    }

    // Query the second page (5-9)
    const secondPageDeposits = await depositsService.getDeposits({
      limit: 5,
      skip: 5,
    });

    // Verify that the second page contains 5 deposits
    expect(secondPageDeposits).to.be.an("array").that.has.lengthOf(5);

    // Verify that the retrieved deposits match the inserted deposits for the second page
    for (let i = 0; i < 5; i++) {
      expect(secondPageDeposits[i]?.depositId).to.equal(
        insertedDeposits[i + 5]?.depositId,
      );
      expect(secondPageDeposits[i]?.depositor).to.equal(
        depositsData[i + 5]?.depositor,
      );
    }
  });
  it("should add a deposit with related entities and verify the data", async () => {
    const swapData = {
      id: 1,
      swapToken: "0xswapToken",
      acrossInputToken: "0xacrossInputToken",
      acrossOutputToken: "0xacrossOutputToken",
      swapTokenAmount: "100",
      acrossInputAmount: "90",
      acrossOutputAmount: "85",
      exchange: "0xexchange",
      blockHash: "0xblockHash",
      blockNumber: 1010,
      transactionHash: "0xtransaction10",
      logIndex: 10,
      chainId: 1,
      finalised: true,
      createdAt: new Date(),
    };

    const filledRelayData = {
      id: 1,
      relayHash: "0xrelay10",
      internalHash: "0xinternal10",
      depositId: "11",
      originChainId: "1",
      destinationChainId: "2",
      depositor: "0x789",
      recipient: "0xrecipient",
      inputToken: "0xinputToken",
      inputAmount: "10",
      outputToken: "0xoutputToken",
      outputAmount: "9",
      message: "0xmessage",
      exclusiveRelayer: "0xexclusiveRelayer",
      exclusivityDeadline: new Date(),
      fillDeadline: new Date(),
      updatedRecipient: "0xupdatedRecipient",
      updatedMessage: "0xupdatedMessage",
      updatedOutputAmount: "9",
      fillType: 0,
      relayer: "0xrelayer",
      repaymentChainId: 1,
      transactionHash: "0xtransaction10",
      transactionIndex: 10,
      logIndex: 10,
      blockNumber: 1010,
      finalised: true,
      blockTimestamp: new Date(),
    };

    const depositData = {
      id: 1,
      depositor: "0x789",
      relayHash: filledRelayData.relayHash,
      depositId: "11",
      originChainId: "1",
      destinationChainId: "2",
      internalHash: "0xinternal10",
      transactionHash: "0xtransaction10",
      transactionIndex: 10,
      logIndex: 10,
      blockNumber: 1010,
      finalised: true,
      createdAt: new Date(),
      blockTimestamp: new Date(),
    };

    const relayHashInfoData = {
      id: 1,
      depositEventId: depositData.id,
      status: entities.RelayStatus.Filled,
      swapBeforeBridgeEventId: swapData.id,
      fillEventId: filledRelayData.id,
      swapTokenPriceUsd: "1.0",
      swapFeeUsd: "0.1",
      bridgeFeeUsd: "0.05",
      inputPriceUsd: "1.0",
      outputPriceUsd: "0.9",
      fillGasFee: "0.01",
      fillGasFeeUsd: "0.01",
      fillGasTokenPriceUsd: "1.0",
    };
    await depositsFixture.insertDeposits([depositData]);
    await swapBeforeBridgeFixture.insertSwaps([swapData]);
    await fillsFixture.insertFills([filledRelayData]);
    await relayHashInfoFixture.insertRelayHashInfos([relayHashInfoData]);

    // Query the deposit
    const queriedDeposits = await depositsService.getDeposits({
      limit: 1,
      skip: 0,
    });

    // Verify that the deposit and related entities exist
    expect(queriedDeposits).to.be.an("array").that.has.lengthOf(1);
    const queriedDeposit = queriedDeposits[0];
    expect(queriedDeposit?.depositId).to.equal(depositData.depositId);
    expect(queriedDeposit?.depositor).to.equal(depositData.depositor);
    expect(queriedDeposit?.relayHash).to.equal(depositData.relayHash);
    expect(queriedDeposit?.swapToken).to.equal(swapData.swapToken);
    expect(queriedDeposit?.swapTokenAmount).to.equal(swapData.swapTokenAmount);
    expect(queriedDeposit?.relayer).to.equal(filledRelayData.relayer);
    expect(queriedDeposit?.status).to.equal(relayHashInfoData.status);
  });

  it("should return the correct deposit status", async () => {
    // Arrange: Insert a deposit and related relay hash info
    const depositData = {
      id: 1,
      depositor: "0xdepositor",
      relayHash: "0xrelayhash",
      depositId: "1",
      originChainId: "1",
      destinationChainId: "2",
      internalHash: "0xinternal20",
      transactionHash: "0xtransaction20",
      transactionIndex: 20,
      logIndex: 20,
      blockNumber: 1020,
      finalised: true,
      createdAt: new Date(),
      blockTimestamp: new Date(),
    };

    const relayHashInfoData = {
      id: 1,
      depositId: depositData.depositId,
      depositEventId: depositData.id,
      status: entities.RelayStatus.Unfilled,
      originChainId: parseInt(depositData.originChainId),
      swapTokenPriceUsd: "1.0",
      swapFeeUsd: "0.1",
      bridgeFeeUsd: "0.05",
      inputPriceUsd: "1.0",
      outputPriceUsd: "0.9",
      fillGasFee: "0.01",
      fillGasFeeUsd: "0.01",
      fillGasTokenPriceUsd: "1.0",
    };

    await depositsFixture.insertDeposits([depositData]);
    await relayHashInfoFixture.insertRelayHashInfos([relayHashInfoData]);

    // Act: Query the deposit status
    const depositStatus = await depositsService.getDepositStatus({
      depositId: depositData.depositId,
      originChainId: parseInt(depositData.originChainId),
      index: 0,
    });

    // Assert: Verify the deposit status and related fields
    expect(depositStatus).to.be.an("object");
    expect(depositStatus.depositId).to.equal(depositData.depositId);
    expect(depositStatus.status).to.equal("pending");
    expect(depositStatus.pagination.currentIndex).to.equal(0);
    expect(depositStatus.pagination.maxIndex).to.equal(0);
  });
});
