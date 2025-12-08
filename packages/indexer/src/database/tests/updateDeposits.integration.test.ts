import { assert, expect } from "chai";
import { DataSource, Repository } from "typeorm";
import { entities, fixtures } from "@repo/indexer-database";
import { getTestDataSource } from "../../tests/setup";
import { updateDeposits, DepositUpdaterRequestType } from "../Deposits";
import { getChainIdForEndpointId } from "../../data-indexing/adapter/oft/service";
import { getCctpDestinationChainFromDomain } from "../../data-indexing/adapter/cctp-v2/service";

// --- Mock Data Generators (Defaults) ---

const mockV3Deposit = (overrides: Partial<entities.V3FundsDeposited> = {}) =>
  ({
    relayHash: "0xRelayHash1",
    internalHash: "0xInternalHash1",
    depositId: "1",
    originChainId: "10",
    destinationChainId: "42161",
    amount: "1000",
    depositor: "0xAlice",
    recipient: "0xBob",
    inputToken: "0xTokenIn",
    inputAmount: "1000",
    outputToken: "0xTokenOut",
    outputAmount: "990",
    message: "0x",
    exclusiveRelayer: "0xRelayer",
    fillDeadline: new Date(),
    quoteTimestamp: new Date(),
    transactionHash: "0xTxHash1",
    transactionIndex: 1,
    logIndex: 0,
    blockNumber: 100,
    finalised: true,
    fromLiteChain: false,
    toLiteChain: false,
    blockTimestamp: new Date("2023-01-01T10:00:00Z"),
    ...overrides,
  }) as entities.V3FundsDeposited;

const mockV3Fill = (overrides: Partial<entities.FilledV3Relay> = {}) =>
  ({
    internalHash: "0xInternalHash1",
    depositId: "1",
    originChainId: "10",
    destinationChainId: "42161",
    depositor: "0xAlice",
    recipient: "0xBob",
    inputToken: "0xTokenIn",
    inputAmount: "1000",
    outputToken: "0xTokenOut",
    outputAmount: "990",
    message: "0x",
    exclusiveRelayer: "0xRelayer",
    fillDeadline: new Date(),
    updatedRecipient: "0xBob",
    updatedMessage: "0x",
    updatedOutputAmount: "990",
    fillType: 0,
    relayer: "0xRelayer",
    repaymentChainId: 10,
    transactionHash: "0xTxHash2",
    transactionIndex: 1,
    logIndex: 0,
    blockNumber: 200,
    finalised: true,
    blockTimestamp: new Date("2023-01-01T10:05:00Z"),
    ...overrides,
  }) as entities.FilledV3Relay;

const mockOftSent = (overrides: Partial<entities.OFTSent> = {}) =>
  ({
    guid: "0xGuid123",
    dstEid: 30101,
    fromAddress: "0xFrom",
    amountSentLD: "100",
    amountReceivedLD: "99",
    token: "0xToken",
    chainId: "1",
    blockHash: "0xHash",
    blockNumber: 100,
    transactionHash: "0xTx1",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.OFTSent;

const mockOftReceived = (overrides: Partial<entities.OFTReceived> = {}) =>
  ({
    guid: "0xGuid123",
    srcEid: 30110,
    toAddress: "0xTo",
    amountReceivedLD: "99",
    token: "0xToken",
    chainId: "2",
    blockHash: "0xHash2",
    blockNumber: 200,
    transactionHash: "0xTx2",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.OFTReceived;

const mockMessageSent = (overrides: Partial<entities.MessageSent> = {}) =>
  ({
    message: "0x",
    version: 1,
    sourceDomain: 0,
    destinationDomain: 2,
    nonce: "50",
    sender: "0xSender",
    recipient: "0xRecipient",
    destinationCaller: "0x",
    minFinalityThreshold: 1,
    finalityThresholdExecuted: 1,
    messageBody: "0x",
    chainId: "1",
    blockNumber: 100,
    transactionHash: "0xTxCCTP1",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.MessageSent;

const mockDepositForBurn = (overrides: Partial<entities.DepositForBurn> = {}) =>
  ({
    amount: "1000000",
    burnToken: "0xUSDC",
    mintRecipient: "0xRecipient",
    destinationTokenMessenger: "0xMessenger",
    destinationCaller: "0xCaller",
    destinationDomain: 2,
    depositor: "0xDepositor",
    hookData: "0x",
    chainId: "1",
    maxFee: "0",
    minFinalityThreshold: "0",
    feeCollected: "0",
    blockNumber: 100,
    transactionHash: "0xTxCCTP1",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.DepositForBurn;

const mockMessageReceived = (
  overrides: Partial<entities.MessageReceived> = {},
) =>
  ({
    caller: "0xCaller",
    sourceDomain: 0,
    nonce: "50",
    sender: "0xSender",
    finalityThresholdExecuted: 1,
    messageBody: "0x",
    chainId: "42161",
    blockNumber: 200,
    transactionHash: "0xTxCCTP2",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.MessageReceived;

const mockMintAndWithdraw = (
  overrides: Partial<entities.MintAndWithdraw> = {},
) =>
  ({
    mintRecipient: "0xMintRecipient",
    amount: "1000000",
    mintToken: "0xUSDC",
    feeCollected: "0",
    chainId: "42161",
    blockNumber: 200,
    transactionHash: "0xTxCCTP2",
    transactionIndex: 0,
    logIndex: 0,
    finalised: true,
    blockTimestamp: new Date(),
    ...overrides,
  }) as entities.MintAndWithdraw;

// --- Tests ---

describe("DepositUpdater", () => {
  let dataSource: DataSource;
  let depositRepo: Repository<entities.Deposit>;

  // Generic Fixtures
  let v3FundsDepositedFixture: fixtures.GenericFixture<entities.V3FundsDeposited>;
  let filledV3RelayFixture: fixtures.GenericFixture<entities.FilledV3Relay>;
  let oftSentFixture: fixtures.GenericFixture<entities.OFTSent>;
  let oftReceivedFixture: fixtures.GenericFixture<entities.OFTReceived>;
  let messageSentFixture: fixtures.GenericFixture<entities.MessageSent>;
  let depositForBurnFixture: fixtures.GenericFixture<entities.DepositForBurn>;
  let messageReceivedFixture: fixtures.GenericFixture<entities.MessageReceived>;
  let mintAndWithdrawFixture: fixtures.GenericFixture<entities.MintAndWithdraw>;

  beforeEach(async () => {
    dataSource = await getTestDataSource();
    depositRepo = dataSource.getRepository(entities.Deposit);

    // Initialize Fixtures
    v3FundsDepositedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.V3FundsDeposited,
    );
    filledV3RelayFixture = new fixtures.GenericFixture(
      dataSource,
      entities.FilledV3Relay,
    );
    oftSentFixture = new fixtures.GenericFixture(dataSource, entities.OFTSent);
    oftReceivedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.OFTReceived,
    );
    messageSentFixture = new fixtures.GenericFixture(
      dataSource,
      entities.MessageSent,
    );
    depositForBurnFixture = new fixtures.GenericFixture(
      dataSource,
      entities.DepositForBurn,
    );
    messageReceivedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.MessageReceived,
    );
    mintAndWithdrawFixture = new fixtures.GenericFixture(
      dataSource,
      entities.MintAndWithdraw,
    );
  });

  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe("ACROSS Protocol Updates", () => {
    it("should create a new PENDING deposit when only V3FundsDeposited (Source) is processed", async () => {
      const [depositEvent] = await v3FundsDepositedFixture.insert([
        mockV3Deposit({
          internalHash: "0xInternalHash1",
          depositId: "1",
          originChainId: "10",
          depositor: "0xAlice",
        }),
      ]);
      assert(depositEvent);

      const request: DepositUpdaterRequestType = {
        dataSource,
        depositUpdate: {
          across: { deposit: depositEvent },
        },
      };

      await updateDeposits(request);
      const savedDeposit = await depositRepo.findOne({
        where: { uniqueId: depositEvent.internalHash },
      });

      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.PENDING,
        type: entities.DepositType.ACROSS,
        originChainId: depositEvent.originChainId,
        depositor: depositEvent.depositor,
        v3FundsDepositedId: depositEvent.id,
        filledV3RelayId: null,
      });
    });

    it("should create a new FILLED deposit when only FilledV3Relay (Destination) is processed (Orphan Fill)", async () => {
      const [fillEvent] = await filledV3RelayFixture.insert([
        mockV3Fill({
          internalHash: "0xInternalHash2",
          destinationChainId: "42161",
        }),
      ]);
      assert(fillEvent);

      const request: DepositUpdaterRequestType = {
        dataSource,
        depositUpdate: {
          across: { fill: fillEvent },
        },
      };

      await updateDeposits(request);

      const savedDeposit = await depositRepo.findOne({
        where: { uniqueId: fillEvent.internalHash },
      });

      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.FILLED,
        destinationChainId: fillEvent.destinationChainId,
        filledV3RelayId: fillEvent.id,
        v3FundsDepositedId: null,
        type: entities.DepositType.ACROSS,
        depositor: fillEvent.depositor,
        recipient: fillEvent.recipient,
        originChainId: fillEvent.originChainId,
        blockTimestamp: fillEvent.blockTimestamp,
      });
    });

    it("should correctly merge: Deposit (Source) processed FIRST, then Fill (Dest)", async () => {
      const internalHash = "0xSharedHash";

      // Process Source
      const [depositEvent] = await v3FundsDepositedFixture.insert([
        mockV3Deposit({ internalHash }),
      ]);
      assert(depositEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { across: { deposit: depositEvent } },
      });

      let savedDeposit = await depositRepo.findOne({
        where: { uniqueId: internalHash },
      });
      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.PENDING,
      });

      // Process Fill
      const [fillEvent] = await filledV3RelayFixture.insert([
        mockV3Fill({ internalHash }),
      ]);
      assert(fillEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { across: { fill: fillEvent } },
      });

      // Verify Final State
      savedDeposit = await depositRepo.findOne({
        where: { uniqueId: internalHash },
      });

      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.FILLED,
        v3FundsDepositedId: depositEvent.id,
        filledV3RelayId: fillEvent.id,
        destinationChainId: depositEvent.destinationChainId,
        type: entities.DepositType.ACROSS,
        depositor: fillEvent.depositor,
        recipient: fillEvent.recipient,
        originChainId: depositEvent.originChainId,
        blockTimestamp: fillEvent.blockTimestamp,
      });
    });

    it("should correctly merge: Fill (Dest) processed FIRST, then Deposit (Source)", async () => {
      const internalHash = "0xReverseHash";

      // Process Fill
      const [fillEvent] = await filledV3RelayFixture.insert([
        mockV3Fill({ internalHash }),
      ]);
      assert(fillEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { across: { fill: fillEvent } },
      });

      let savedDeposit = await depositRepo.findOne({
        where: { uniqueId: internalHash },
      });
      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.FILLED,
      });

      // Process Source
      const [depositEvent] = await v3FundsDepositedFixture.insert([
        mockV3Deposit({
          internalHash,
        }),
      ]);
      assert(depositEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { across: { deposit: depositEvent } },
      });

      // Verify Final State
      savedDeposit = await depositRepo.findOne({
        where: { uniqueId: internalHash },
      });

      expect(savedDeposit).to.exist;
      expect(savedDeposit).to.deep.include({
        status: entities.DepositStatus.FILLED,
        v3FundsDepositedId: depositEvent.id,
        filledV3RelayId: fillEvent.id,
        destinationChainId: depositEvent.destinationChainId,
        type: entities.DepositType.ACROSS,
        depositor: fillEvent.depositor,
        recipient: fillEvent.recipient,
        originChainId: depositEvent.originChainId,
        // We override the block timestamp with the event that was last observed
        blockTimestamp: depositEvent.blockTimestamp,
      });
    });
  });

  describe("OFT Protocol Updates", () => {
    const guid = "0xGuid123";

    it("should merge OFT Sent and Received events correctly", async () => {
      // Save OFT Sent
      const originEndpointId = 30110;
      const destinationEndpointId = 30101;
      const [sentEvent] = await oftSentFixture.insert([
        mockOftSent({
          guid,
          dstEid: destinationEndpointId,
          chainId: getChainIdForEndpointId(originEndpointId).toString(),
        }),
      ]);
      assert(sentEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { oft: { sent: sentEvent } },
      });

      let deposit = await depositRepo.findOne({ where: { uniqueId: guid } });
      expect(deposit).to.exist;
      expect(deposit).to.deep.include({
        status: entities.DepositStatus.PENDING,
        type: entities.DepositType.OFT,
        depositor: sentEvent.fromAddress,
        oftSentId: sentEvent.id,
        destinationChainId: getChainIdForEndpointId(destinationEndpointId),
        originChainId: sentEvent.chainId,
      });

      // Save OFT Received
      const [receivedEvent] = await oftReceivedFixture.insert([
        mockOftReceived({
          guid,
          srcEid: originEndpointId,
          chainId: getChainIdForEndpointId(destinationEndpointId).toString(),
        }),
      ]);
      assert(receivedEvent);

      await updateDeposits({
        dataSource,
        depositUpdate: { oft: { received: receivedEvent } },
      });

      deposit = await depositRepo.findOne({ where: { uniqueId: guid } });
      expect(deposit).to.exist;
      expect(deposit).to.deep.include({
        status: entities.DepositStatus.FILLED,
        oftSentId: sentEvent.id,
        oftReceivedId: receivedEvent.id,
        recipient: receivedEvent.toAddress,
        destinationChainId: receivedEvent.chainId,
        type: entities.DepositType.OFT,
        depositor: sentEvent.fromAddress,
        originChainId: sentEvent.chainId,
      });
    });
  });

  describe("CCTP Protocol Updates", () => {
    // Note: We use real DB inserts here to respect potential FK constraints,
    // even though the service receives objects.

    it("should insert CCTP Burn event", async () => {
      const [messageSent] = await messageSentFixture.insert([
        mockMessageSent({
          nonce: "50",
          destinationDomain: 2,
          chainId: "1",
        }),
      ]);
      assert(messageSent);
      const [depositForBurn] = await depositForBurnFixture.insert([
        // DepositForBurn and MessageSent are in the same transaction
        mockDepositForBurn({
          transactionHash: messageSent.transactionHash,
          mintRecipient: messageSent.recipient,
        }),
      ]);
      assert(depositForBurn);

      await updateDeposits({
        dataSource,
        depositUpdate: {
          cctp: {
            burn: {
              messageSent,
              depositForBurn,
            },
          },
        },
      });

      // Expected ID logic from handler: nonce-destinationChainId
      const destinationChainId = getCctpDestinationChainFromDomain(
        messageSent.destinationDomain,
      );
      const expectedId = `${messageSent.nonce}-${destinationChainId}`;
      const deposit = await depositRepo.findOne({
        where: { uniqueId: expectedId },
      });

      expect(deposit).to.exist;
      expect(deposit).to.deep.include({
        type: entities.DepositType.CCTP,
        status: entities.DepositStatus.PENDING,
        depositForBurnId: depositForBurn.id,
        blockTimestamp: messageSent.blockTimestamp,
        depositor: depositForBurn.depositor,
        destinationChainId: getCctpDestinationChainFromDomain(
          depositForBurn.destinationDomain,
        ),
        originChainId: depositForBurn.chainId,
        recipient: depositForBurn.mintRecipient,
      });
    });

    it("should insert CCTP Mint event and set status to FILLED", async () => {
      const [messageReceived] = await messageReceivedFixture.insert([
        mockMessageReceived({
          nonce: "50",
          sourceDomain: 0,
          chainId: "42161",
        }),
      ]);
      assert(messageReceived);
      const [mintAndWithdraw] = await mintAndWithdrawFixture.insert([
        mockMintAndWithdraw({
          mintRecipient: messageReceived.sender,
          transactionHash: messageReceived.transactionHash,
        }),
      ]);
      assert(mintAndWithdraw);

      await updateDeposits({
        dataSource,
        depositUpdate: {
          cctp: {
            mint: {
              messageReceived,
              mintAndWithdraw,
            },
          },
        },
      });

      // Expected ID logic from handler: nonce-destinationChainId
      const expectedId = `${messageReceived.nonce}-${mintAndWithdraw.chainId}`;
      const deposit = await depositRepo.findOne({
        where: { uniqueId: expectedId },
      });

      expect(deposit).to.exist;
      expect(deposit).to.deep.include({
        type: entities.DepositType.CCTP,
        status: entities.DepositStatus.FILLED,
        mintAndWithdrawId: mintAndWithdraw.id,
        blockTimestamp: messageReceived.blockTimestamp,
        // Without the MessageSent event we do not know who the depositor is
        depositor: null,
        destinationChainId: messageReceived.chainId,
        originChainId: getCctpDestinationChainFromDomain(
          messageReceived.sourceDomain,
        ),
        recipient: mintAndWithdraw.mintRecipient,
      });
    });
  });
  it("should create a PENDING deposit when only CCTP MessageSent is processed (without DepositForBurn)", async () => {
    const [messageSent] = await messageSentFixture.insert([
      mockMessageSent({
        nonce: "60",
        destinationDomain: 2,
        sourceDomain: 0,
        sender: "0xSenderOnly",
      }),
    ]);
    assert(messageSent);

    await updateDeposits({
      dataSource,
      depositUpdate: {
        cctp: {
          burn: {
            messageSent,
            // depositForBurn is explicitly undefined/missing
          },
        },
      },
    });

    const destinationChainId = getCctpDestinationChainFromDomain(
      messageSent.destinationDomain,
    );
    const expectedId = `${messageSent.nonce}-${destinationChainId}`;
    const deposit = await depositRepo.findOne({
      where: { uniqueId: expectedId },
    });

    expect(deposit).to.exist;
    expect(deposit).to.deep.include({
      type: entities.DepositType.CCTP,
      status: entities.DepositStatus.PENDING,
      depositForBurnId: null,
      blockTimestamp: messageSent.blockTimestamp,
      depositor: null,
      destinationChainId: destinationChainId,
      originChainId: messageSent.chainId,
      recipient: messageSent.recipient,
    });
  });

  it("should create a FILLED deposit when only CCTP MessageReceived is processed (without MintAndWithdraw)", async () => {
    const [messageReceived] = await messageReceivedFixture.insert([
      mockMessageReceived({
        nonce: "60",
        sourceDomain: 0,
        chainId: "42161",
        sender: "0xSenderOnly",
      }),
    ]);
    assert(messageReceived);

    await updateDeposits({
      dataSource,
      depositUpdate: {
        cctp: {
          mint: {
            messageReceived,
            // mintAndWithdraw is explicitly undefined/missing
          },
        },
      },
    });

    // Expected ID logic from handler: nonce-destinationChainId
    const expectedId = `${messageReceived.nonce}-${messageReceived.chainId}`;
    const deposit = await depositRepo.findOne({
      where: { uniqueId: expectedId },
    });

    expect(deposit).to.exist;
    expect(deposit).to.deep.include({
      type: entities.DepositType.CCTP,
      status: entities.DepositStatus.FILLED,
      mintAndWithdrawId: null,
      blockTimestamp: messageReceived.blockTimestamp,
      depositor: null,
      recipient: null,
      originChainId: getCctpDestinationChainFromDomain(
        messageReceived.sourceDomain,
      ),
      destinationChainId: messageReceived.chainId,
    });
  });
});
