import { CHAIN_IDs } from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";
import { assert, expect } from "chai";
import { ethers } from "ethers";
import * as sinon from "sinon";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import { entities } from "@repo/indexer-database";
import { CCTPRepository } from "../../database/CctpRepository";
import { getTestDataSource } from "../../tests/setup";
import { createTestRetryProvider } from "../../tests/testProvider";
import { decodeHookData, decodeMessageBody } from "../adapter/cctp-v2/service";
import { BlockRange } from "../model";
import { CCTPIndexerDataHandler } from "../service/CCTPIndexerDataHandler";
import { stubContractUtils } from "./utils";

/**
 * Test suite for the CCTPIndexerDataHandler.
 *
 * This suite covers the functionality of the CCTPIndexerDataHandler, ensuring that it
 * can correctly fetch and process CCTP events within specified block ranges. It uses
 * a test database and stubs to isolate the data handler's logic for verification.
 */
describe("CCTPIndexerDataHandler", () => {
  let dataSource: DataSource;
  let cctpRepository: CCTPRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: CCTPIndexerDataHandler;

  function setupTestForChainId(chainId: number) {
    provider = createTestRetryProvider(chainId, logger);
    handler = new CCTPIndexerDataHandler(
      logger,
      chainId,
      provider,
      cctpRepository,
    );
  }

  beforeEach(async () => {
    dataSource = await getTestDataSource();
    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    cctpRepository = new CCTPRepository(dataSource, logger);
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  /**
   * This test verifies that the CCTPIndexerDataHandler can correctly fetch events
   * for a given block range. It focuses on a specific sample transaction to ensure
   * that the event fetching logic is working as expected.
   */
  it("should fetch events for a given block range including a sample transaction", async () => {
    const transactionHash =
      "0x1c21e4117c98efb94600d42d7500aaf221d7614ff3a06a3e5f6fb7d605a27d0b";
    const blockNumber = 214159659;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPSrcPeriphery",
      "0x79176E2E91c77b57AC11c6fe2d2Ab2203D87AF85",
      CHAIN_IDs.ARBITRUM_SEPOLIA,
    );
    setupTestForChainId(CHAIN_IDs.ARBITRUM_SEPOLIA);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    const events = await (handler as any).fetchEventsByRange(blockRange);

    expect(events.sponsoredBurnEvents).to.have.lengthOf(1);
    expect(events.sponsoredBurnEvents[0]!.transactionHash).to.equal(
      transactionHash,
    );
  }).timeout(10000); // Increase timeout for network requests

  /**
   * This test ensures that the CCTPIndexerDataHandler can correctly process and store
   * a SponsoredDepositForBurn event in the database. It simulates the processing of a
   * block range containing a specific transaction and verifies that the event is persisted.
   */
  it("should store sponsoredDepositForBurn event in the database", async () => {
    const transactionHash =
      "0x1c21e4117c98efb94600d42d7500aaf221d7614ff3a06a3e5f6fb7d605a27d0b";
    const blockNumber = 214159659;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPSrcPeriphery",
      "0x79176E2E91c77b57AC11c6fe2d2Ab2203D87AF85",
      CHAIN_IDs.ARBITRUM_SEPOLIA,
    );
    setupTestForChainId(CHAIN_IDs.ARBITRUM_SEPOLIA);

    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    await handler.processBlockRange(blockRange, blockNumber);

    const sponsoredDepositForBurnRepository = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    const savedEvent = await sponsoredDepositForBurnRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(10000);

  it("should fetch and store SimpleTransferFlowCompleted event in the database", async () => {
    const transactionHash =
      "0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb";
    const blockNumber = 18541961;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPDstPeriphery",
      "0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95",
    );
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterMintTransactions method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterMintTransactions").returnsArg(0);

    await handler.processBlockRange(blockRange, blockNumber);

    const simpleTransferFlowCompletedRepository = dataSource.getRepository(
      entities.SimpleTransferFlowCompleted,
    );
    const savedEvent = await simpleTransferFlowCompletedRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(10000);

  it("should fetch and store ArbitraryActionsExecuted event in the database", async () => {
    const transactionHash =
      "0x869d1df5f1e7b6b91a824d8e2b455ac48d1f26f0b5f2823c96df391eb75dff34";
    const blockNumber = 18510668;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPDstPeriphery",
      "0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95",
    );
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterMintTransactions method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterMintTransactions").returnsArg(0);

    await handler.processBlockRange(blockRange, blockNumber);

    const arbitraryActionsExecutedRepository = dataSource.getRepository(
      entities.ArbitraryActionsExecuted,
    );
    const savedEvent = await arbitraryActionsExecutedRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
    expect(savedEvent!.quoteNonce).to.equal(
      "0x5f9418447e204674cdbad4ad7c229de63849a63e82f1c698cc0cca8e71143a6e",
    );
    expect(savedEvent!.initialToken).to.equal(
      "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    );
    expect(savedEvent!.initialAmount.toString()).to.equal("99990");
    expect(savedEvent!.finalToken).to.equal(
      "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    );
    expect(savedEvent!.finalAmount.toString()).to.equal("99990");
  }).timeout(10000);

  it("should fetch and store FallbackHyperEVMFlowCompleted event in the database", async () => {
    const transactionHash =
      "0xb940059314450f7f7cb92972182cdf3f5fb5f54aab27c28b7426a78e6fb32d02";
    const blockNumber = 18913313;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPDstPeriphery",
      "0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95",
    );
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterMintTransactions method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterMintTransactions").returnsArg(0);

    await handler.processBlockRange(blockRange, blockNumber);

    const fallbackHyperEVMFlowCompletedRepository = dataSource.getRepository(
      entities.FallbackHyperEVMFlowCompleted,
    );
    const savedEvent = await fallbackHyperEVMFlowCompletedRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
    expect(savedEvent!.quoteNonce).to.equal(
      "0xd4731c4ab33b3a364d599940d9ba46df41f6a75233a361e2d312e072540ed184",
    );
    expect(savedEvent!.finalRecipient).to.equal(
      "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
    );
    expect(savedEvent!.finalToken).to.equal(
      "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    );
    expect(savedEvent!.evmAmountIn.toString()).to.equal("999900");
    expect(savedEvent!.bridgingFeesIncurred.toString()).to.equal("100");
    expect(savedEvent!.evmAmountSponsored.toString()).to.equal("0");
  }).timeout(10000);

  it("should fetch hypercore withdraw data and be able to decode the hookData", async () => {
    const transactionHash =
      "0x13b9b9dfb7f8804d385db96454d094791b8ab618556fcd37fb17c4b206499871";
    const blockNumber = 213803846;
    setupTestForChainId(CHAIN_IDs.ARBITRUM_SEPOLIA);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    await handler.processBlockRange(blockRange, blockNumber);

    const messageReceivedRepositroy = dataSource.getRepository(
      entities.MessageReceived,
    );

    const savedEvent = await messageReceivedRepositroy.findOneOrFail({
      where: { transactionHash: transactionHash },
    });
    // Tx can be found here: https://app.hyperliquid-testnet.xyz/explorer/tx/0xb8275884570f48f7b9a1041b70e2310113007069f20267c95bf003d7160322e2
    // And here: https://sepolia.arbiscan.io/tx/0x13b9b9dfb7f8804d385db96454d094791b8ab618556fcd37fb17c4b206499871
    const decodedMessageBody = decodeMessageBody(savedEvent.messageBody);
    assert(decodedMessageBody, "Expected to decode messageBody");
    expect(decodedMessageBody.version).to.equal(1);
    expect(decodedMessageBody.burnToken).to.equal(
      "0x0000000000000000000000002b3370ee501b4a559b57d449569354196457d8ab",
    );
    expect(decodedMessageBody.mintRecipient).to.equal(
      "0x0000000000000000000000003f51b87ae65548ab996bdbb363f2553a311ef43e",
    );
    expect(decodedMessageBody.amount.toNumber()).to.equal(3000000);
    expect(decodedMessageBody.maxFee.toNumber()).to.equal(200000);

    const decodedHookData = decodeHookData(decodedMessageBody.hookData);
    assert(decodedHookData, "Expected to decode hookData");
    expect(decodedHookData.hyperCoreNonce.toNumber()).to.equal(1762785559609);
    expect(decodedHookData.fromAddress).to.equal(
      "0x3F51b87ae65548ab996BDBB363F2553a311eF43E",
    );
    expect(
      ethers.utils.toUtf8String(
        ethers.utils.arrayify(decodedHookData.magicBytes),
      ),
    ).to.contain("cctp-forward");
    expect(decodedHookData.versionId).to.equal(0);
  }).timeout(10000);

  /**
   * This test verifies that the CCTPIndexerDataHandler can correctly store
   * HyperCore CCTP withdrawal data in the database. It processes a block range
   * containing a HyperCore withdrawal and verifies that the withdrawal is persisted
   * with the correct decoded hook data and proper foreign key relation to MessageReceived.
   */
  it("should store hypercore withdraw data in HypercoreCctpWithdraw table", async () => {
    const transactionHash =
      "0xd2ca74feb6b4c9c3fa517f438efb8879c257593405ac0b757193f3c2c612212e";
    const blockNumber = 214432121;
    setupTestForChainId(CHAIN_IDs.ARBITRUM_SEPOLIA);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    await handler.processBlockRange(blockRange, blockNumber);

    // Verify the MessageReceived event was stored
    const messageReceivedRepository = dataSource.getRepository(
      entities.MessageReceived,
    );
    const savedMessageReceived = await messageReceivedRepository.findOneOrFail({
      where: { transactionHash: transactionHash },
    });

    // Decode the message body to get expected values
    const decodedMessageBody = decodeMessageBody(
      savedMessageReceived.messageBody,
    );
    assert(decodedMessageBody, "Expected to decode messageBody");

    const decodedHookData = decodeHookData(decodedMessageBody.hookData);
    assert(decodedHookData, "Expected to decode hookData");

    // Verify the HypercoreCctpWithdraw was stored
    const hypercoreCctpWithdrawRepository = dataSource.getRepository(
      entities.HypercoreCctpWithdraw,
    );
    const savedWithdrawal = await hypercoreCctpWithdrawRepository.findOneOrFail(
      {
        where: {
          fromAddress: decodedHookData.fromAddress,
          hypercoreNonce: decodedHookData.hyperCoreNonce.toString(),
        },
      },
    );

    // Verify the stored data matches decoded values
    expect(savedWithdrawal).to.exist;
    expect(savedWithdrawal.fromAddress).to.equal(decodedHookData.fromAddress);
    expect(savedWithdrawal.hypercoreNonce).to.equal(
      decodedHookData.hyperCoreNonce.toNumber(),
    );
    expect(savedWithdrawal.originChainId).to.equal(CHAIN_IDs.HYPEREVM_TESTNET);
    expect(savedWithdrawal.destinationChainId).to.equal(
      CHAIN_IDs.ARBITRUM_SEPOLIA,
    );
    expect(savedWithdrawal.versionId).to.equal(decodedHookData.versionId);
    expect(savedWithdrawal.declaredLength).to.equal(
      decodedHookData.declaredLength,
    );
    expect(savedWithdrawal.magicBytes).to.equal(decodedHookData.magicBytes);
    expect(savedWithdrawal.userData).to.equal(decodedHookData.userData);
    expect(savedWithdrawal.mintTxnHash).to.equal(transactionHash);
    expect(savedWithdrawal.mintEventId).to.equal(savedMessageReceived.id);

    // Verify the magic bytes contain "cctp-forward"
    expect(
      ethers.utils.toUtf8String(
        ethers.utils.arrayify(savedWithdrawal.magicBytes),
      ),
    ).to.contain("cctp-forward");
  }).timeout(10000);

  it("should fetch and store SwapFlowFinalized event in the database", async () => {
    // Taken from https://hyperevmscan.io/tx/0x15d5b49cece7e1c90ca03074c809e02ffefa40112f9051aa681d18d856f6fbd3
    const transactionHash =
      "0x15d5b49cece7e1c90ca03074c809e02ffefa40112f9051aa681d18d856f6fbd3";
    // Block number for the tx on HyperEVM
    const blockNumber = 21420192;
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    await handler.processBlockRange(blockRange, blockNumber);

    const swapFlowFinalizedRepository = dataSource.getRepository(
      entities.SwapFlowFinalized,
    );
    const savedEvent = await swapFlowFinalizedRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.deep.include({
      // Identity & Indexing
      chainId: CHAIN_IDs.HYPEREVM,
      blockNumber: blockNumber,
      transactionHash: transactionHash,
      logIndex: 10,
      transactionIndex: 4,
      finalised: true,
      quoteNonce:
        "0xe887e72e2b5dd7ea466bb32701b0e45cc862f4bda3887192f346eb26733d3f4c",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      // Amounts (Expected as strings for 'numeric'/'bigint' columns)
      totalSent: 1100000000,
      evmAmountSponsored: 11539,
    });
  }).timeout(10000);

  it("should fetch and store SwapFlowInitialized event in the database", async () => {
    // Taken from https://hyperevmscan.io/tx/0xfd60b3c77fa72557a747ca537adbfd8578f26c045bc8dfc6b248eb3300834779#eventlog#6
    const transactionHash =
      "0xfd60b3c77fa72557a747ca537adbfd8578f26c045bc8dfc6b248eb3300834779";

    const blockNumber = 21420009;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPDstPeriphery",
      "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f",
    );
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterMintTransactions method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterMintTransactions").returnsArg(0);

    await handler.processBlockRange(blockRange, blockNumber);

    const swapFlowInitializedRepository = dataSource.getRepository(
      entities.SwapFlowInitialized,
    );

    const savedEvent = await swapFlowInitializedRepository.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(savedEvent).to.deep.include({
      // Identity & Indexing
      chainId: CHAIN_IDs.HYPEREVM,
      blockNumber: blockNumber,
      transactionHash: transactionHash,
      logIndex: 6,
      transactionIndex: 0,
      finalised: true,
      quoteNonce:
        "0xe887e72e2b5dd7ea466bb32701b0e45cc862f4bda3887192f346eb26733d3f4c",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      // Amounts (Expected as strings for 'numeric'/'bigint' columns)
      evmAmountIn: 10998900,
      bridgingFeesIncurred: 1100,
      coreAmountIn: 1099890000,
      minAmountToSend: 1100000000,
      maxAmountToSend: 1100000000,
    });

    // Date Assertion
    // We check that it is a valid date object, rather than a specific ms timestamp
    expect(savedEvent!.blockTimestamp).to.be.instanceOf(Date);
  }).timeout(10000);

  it("should fetch burn and sponsored burn events to Lighter", async () => {
    // https://arbiscan.io/tx/0x2f866714d04523775153be07f0680ae6c3f28f08af8fa574317e2d16e826aa54
    const transactionHash =
      "0xef55d3110094488b943525fd6609e7918328009168e661658b5fb858434b78a0";
    const blockNumber = 411671197;
    // // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    setupTestForChainId(CHAIN_IDs.ARBITRUM);

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPSrcPeriphery",
      "0xAA4958EFa0Cf6DdD87e354a90785f1D7291a82c7",
      CHAIN_IDs.ARBITRUM,
    );

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    await handler.processBlockRange(blockRange, blockNumber);

    const sponsoredDepositForBurnRepository = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    const savedSponsoredEvent = await sponsoredDepositForBurnRepository.findOne(
      {
        where: { transactionHash: transactionHash },
      },
    );
    const depositForBurnRepository = dataSource.getRepository(
      entities.DepositForBurn,
    );
    const savedBurnEvent = await depositForBurnRepository.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(savedBurnEvent).to.exist;
    expect(savedBurnEvent!.transactionHash).to.equal(transactionHash);
    expect(savedBurnEvent!.blockNumber).to.equal(blockNumber);
    expect(savedSponsoredEvent).to.exist;
    expect(savedSponsoredEvent!.transactionHash).to.equal(transactionHash);
    expect(savedSponsoredEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(10000);

  it("should fetch mint events on Lighter", async () => {
    const transactionHash =
      "0x347753987aac08486f047b47795c7e2d874cfbecfbba1869146177e54a2e9095";
    const blockNumber = 24021731;
    setupTestForChainId(CHAIN_IDs.MAINNET);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    await handler.processBlockRange(blockRange, blockNumber);

    const messageReceivedRepository = dataSource.getRepository(
      entities.MessageReceived,
    );
    const savedMessageReceivedEvent = await messageReceivedRepository.findOne({
      where: { transactionHash: transactionHash },
    });
    const mintAndWithdrawRepository = dataSource.getRepository(
      entities.MintAndWithdraw,
    );
    const savedMintEvent = await mintAndWithdrawRepository.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(savedMintEvent).to.exist;
    expect(savedMintEvent!.transactionHash).to.equal(transactionHash);
    expect(savedMintEvent!.blockNumber).to.equal(blockNumber);
    expect(savedMessageReceivedEvent).to.exist;
    expect(savedMessageReceivedEvent!.transactionHash).to.equal(
      transactionHash,
    );
    expect(savedMessageReceivedEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(10000);
});
