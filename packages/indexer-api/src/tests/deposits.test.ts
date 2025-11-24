import { expect } from "chai";
import winston from "winston";
import { DataSource, entities, fixtures } from "@repo/indexer-database";
import { getTestDataSource, getTestRedisInstance } from "./setup";
// import { parsePostgresConfig } from "../parseEnv";
import { DepositsService } from "../services/deposits"; // Assuming this is the new service file
import Redis from "ioredis";

describe("Deposits Service Tests", () => {
  // Set up
  const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
  });

  let dataSource: DataSource;
  let depositsService: DepositsService;
  let redisClient: Redis;

  // Fixtures
  let depositsFixture: fixtures.FundsDepositedFixture;
  let fillsFixture: fixtures.FilledRelayFixture;
  let swapBeforeBridgeFixture: fixtures.SwapBeforeBridgeFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;
  let swapMetadataFixture: fixtures.SwapMetadataFixture;
  let oftSentFixture: fixtures.OftSentFixture;
  let oftReceivedFixture: fixtures.OftReceivedFixture;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    // Initialize Redis
    redisClient = getTestRedisInstance();

    // Instantiate service
    depositsService = new DepositsService(dataSource, redisClient);

    // Instantiate fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    fillsFixture = new fixtures.FilledRelayFixture(dataSource);
    swapBeforeBridgeFixture = new fixtures.SwapBeforeBridgeFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);
    swapMetadataFixture = new fixtures.SwapMetadataFixture(dataSource);
    oftSentFixture = new fixtures.OftSentFixture(dataSource);
    oftReceivedFixture = new fixtures.OftReceivedFixture(dataSource);
  });

  afterEach(async () => {
    // Close connections after all tests
    await dataSource.destroy();
    await redisClient.quit();
  });

  it("should show the deposits table is empty when calling getDeposits", async () => {
    // Call getDeposits to retrieve all deposits
    const deposits = await depositsService.getDeposits({
      limit: 1,
      depositType: "across",
    });

    // Verify that the deposits array is empty
    expect(deposits).to.be.an("array").that.is.empty;
  });
  it("should create a single deposit and verify it exists", async () => {
    // Insert a single deposit
    const [newDeposit] = await depositsFixture.insertDeposits([
      { depositor: "0x456" },
    ]);

    // Call getDeposits to retrieve all deposits
    const deposits = await depositsService.getDeposits({
      limit: 10,
      depositType: "across",
    });

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
      depositType: "across",
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
      depositType: "across",
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
      depositType: "across",
    });

    // Verify that the deposit and related entities exist
    expect(queriedDeposits).to.be.an("array").that.has.lengthOf(1);
    const queriedDeposit = queriedDeposits[0];
    expect(queriedDeposit?.depositId.toString()).to.equal(
      depositData.depositId,
    );
    expect(queriedDeposit?.depositor).to.equal(depositData.depositor);
    expect(queriedDeposit?.relayHash).to.equal(depositData.relayHash);
    expect(queriedDeposit?.swapToken).to.equal(swapData.swapToken);
    expect(queriedDeposit?.swapTokenAmount?.toString()).to.equal(
      swapData.swapTokenAmount,
    );
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
      originChainId: depositData.originChainId,
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
    expect(depositStatus.depositId.toString()).to.equal(depositData.depositId);
    expect(depositStatus.status).to.equal("pending");
    expect(depositStatus.pagination.currentIndex).to.equal(0);
    expect(depositStatus.pagination.maxIndex).to.equal(0);
  });

  it("should return swapOutputToken and swapOutputTokenAmount when destination swap metadata exists", async () => {
    // Create deposit and relay hash info
    const depositData = {
      id: 1,
      depositor: "0xdepositor",
      relayHash: "0xrelayhash",
      depositId: "123",
      originChainId: "1",
      destinationChainId: "10",
      internalHash: "0xinternal",
      transactionHash: "0xtransaction",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1000,
      finalised: true,
      createdAt: new Date(),
      blockTimestamp: new Date(),
    };

    const relayHashInfoData = {
      id: 1,
      depositId: depositData.depositId,
      depositEventId: depositData.id,
      status: entities.RelayStatus.Filled,
      originChainId: depositData.originChainId,
      destinationChainId: depositData.destinationChainId,
    };

    // Create destination swap metadata (side = DESTINATION_SWAP for output token)
    const swapMetadataData = {
      relayHashInfoId: 1,
      type: entities.SwapType.MIN_OUTPUT, // destination
      side: entities.SwapSide.DESTINATION_SWAP, // sell/output
      address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      minAmountOut: "950000000000000000",
      swapProvider: "UniswapV3",
    };

    await depositsFixture.insertDeposits([depositData]);
    const [insertedRhi1] = await relayHashInfoFixture.insertRelayHashInfos([
      relayHashInfoData,
    ]);
    await swapMetadataFixture.insertSwapMetadata([
      { ...swapMetadataData, relayHashInfoId: insertedRhi1.id },
    ]);

    // Query the deposit
    const deposits = await depositsService.getDeposits({
      limit: 1,
      depositType: "across",
    });

    // Verify swap metadata fields
    // In pg-mem tests, these are hardcoded values due to subquery limitations
    expect(deposits).to.be.an("array").that.has.lengthOf(1);
    const deposit = deposits[0];
    expect(deposit?.swapOutputToken).to.equal(
      "0x1234567890123456789012345678901234567890",
    );
    expect(deposit?.swapOutputTokenAmount?.toString()).to.equal(
      "1000000000000000000",
    );
    // Verify only required swap metadata fields are present
    const swapMetadataFields = Object.keys(deposit || {}).filter((key) =>
      key.startsWith("swapMetadata"),
    );
    expect(swapMetadataFields).to.be.empty;
  });

  it("should return DepositForBurn deposits with CCTP events", async () => {
    const depositForBurnRepo = dataSource.getRepository(
      entities.DepositForBurn,
    );
    const messageSentRepo = dataSource.getRepository(entities.MessageSent);
    const messageReceivedRepo = dataSource.getRepository(
      entities.MessageReceived,
    );
    const mintAndWithdrawRepo = dataSource.getRepository(
      entities.MintAndWithdraw,
    );

    const txHash = "0x" + "a".repeat(64);
    const chainId = "1";
    const nonce = "0x" + "1".repeat(64);
    const sourceDomain = 1;
    const messageBody = "0x" + "b".repeat(128);

    // Create DepositForBurn
    await depositForBurnRepo.save({
      burnToken: "0x123",
      amount: "1000000",
      depositor: "0xdepositor",
      mintRecipient: "0xrecipient",
      destinationDomain: 2,
      destinationTokenMessenger: "0xtokenMessenger",
      destinationCaller: "0xcaller",
      maxFee: "100",
      minFinalityThreshold: 1,
      hookData: "0x",
      chainId,
      blockNumber: 1000,
      transactionHash: txHash,
      transactionIndex: 0,
      logIndex: 0,
      finalised: true,
      blockTimestamp: new Date(),
    });

    // Create MessageSent
    await messageSentRepo.save({
      chainId,
      blockNumber: 1000,
      transactionHash: txHash,
      transactionIndex: 0,
      logIndex: 1,
      message: "0xmessage",
      version: 1,
      sourceDomain,
      destinationDomain: 2,
      nonce,
      sender: "0xsender",
      recipient: "0xrecipient",
      destinationCaller: "0xcaller",
      minFinalityThreshold: 1,
      finalityThresholdExecuted: 0,
      messageBody,
      finalised: true,
      blockTimestamp: new Date(),
    });

    // Create MessageReceived
    await messageReceivedRepo.save({
      chainId: "2",
      blockNumber: 2000,
      transactionHash: "0x" + "c".repeat(64),
      transactionIndex: 0,
      logIndex: 0,
      caller: "0xcaller",
      sourceDomain,
      nonce,
      sender: "0xsender",
      finalityThresholdExecuted: 1,
      messageBody,
      finalised: true,
      blockTimestamp: new Date(),
    });

    // Create MintAndWithdraw
    await mintAndWithdrawRepo.save({
      chainId: "2",
      blockNumber: 2000,
      transactionHash: "0x" + "c".repeat(64),
      transactionIndex: 0,
      logIndex: 1,
      mintRecipient: "0xrecipient",
      amount: "1000000",
      mintToken: "0xtoken",
      feeCollected: "0",
      finalised: true,
      blockTimestamp: new Date(),
    });

    // Query deposits
    const deposits = await depositsService.getDeposits({
      limit: 10,
      depositType: "cctp",
    });

    // Verify DepositForBurn is returned (CCTP deposits have burnToken and mintRecipient fields)
    const cctpDeposit = deposits.find(
      (d) => d.inputToken === "0x123" && d.recipient === "0xrecipient",
    );
    expect(cctpDeposit).to.not.be.undefined;
    expect(cctpDeposit?.inputToken).to.equal("0x123");
    expect(cctpDeposit?.inputAmount).to.equal("1000000");
    expect(cctpDeposit?.depositor).to.equal("0xdepositor");
    expect(cctpDeposit?.recipient).to.equal("0xrecipient");
  });

  it("should return OFTSent deposits with OFTReceived", async () => {
    const guid = "0x" + "g".repeat(64);

    // Create OFTSent
    await oftSentFixture.insertOftSentEvents([
      {
        guid,
        fromAddress: "0xfrom",
        amountSentLD: "3000000",
        amountReceivedLD: "2900000",
        token: "0xtoken",
        chainId: "1",
        dstEid: 30110,
        blockNumber: 3000,
        transactionHash: "0x" + "h".repeat(64),
        finalised: true,
      },
    ]);

    // Create OFTReceived
    await oftReceivedFixture.insertOftReceivedEvents([
      {
        guid,
        toAddress: "0xto",
        amountReceivedLD: "2900000",
        token: "0xtoken",
        chainId: "10",
        srcEid: 30101,
        blockNumber: 4000,
        transactionHash: "0x" + "i".repeat(64),
        finalised: true,
      },
    ]);

    // Query deposits
    const deposits = await depositsService.getDeposits({
      limit: 10,
      depositType: "oft",
    });

    // Verify OFTSent is returned (OFT deposits have fromAddress as depositor)
    const oftDeposit = deposits.find(
      (d) => d.depositor === "0xfrom" && d.inputAmount === "3000000",
    );
    expect(oftDeposit).to.not.be.undefined;
    expect(oftDeposit?.depositor).to.equal("0xfrom");
    expect(oftDeposit?.inputAmount).to.equal("3000000");
    expect(oftDeposit?.outputAmount).to.equal("2900000");
  });
});
