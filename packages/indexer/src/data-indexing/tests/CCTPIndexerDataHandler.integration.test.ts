import { assert, expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import * as sinon from "sinon";
import { CHAIN_IDs } from "@across-protocol/constants";
import { getTestDataSource } from "../../tests/setup";
import { CCTPIndexerDataHandler } from "../service/CCTPIndexerDataHandler";
import { CCTPRepository } from "../../database/CctpRepository";
import { BlockRange } from "../model";
import { createTestRetryProvider } from "../../tests/testProvider";
import { entities } from "../../../../indexer-database/dist/src";
import { decodeHookData, decodeMessageBody } from "../adapter/cctp-v2/service";
import { ethers } from "ethers";

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
    cctpRepository = new CCTPRepository(dataSource, logger);

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;
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
      "0xcb92b553ebf00a2fff5ab04d4966b5a1d4a37afec858308e4d87ef12bea63576";
    const blockNumber = 209540538;
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
      "0xcb92b553ebf00a2fff5ab04d4966b5a1d4a37afec858308e4d87ef12bea63576";
    const blockNumber = 209540538;
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
      "0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9";
    const blockNumber = 36200188;
    setupTestForChainId(CHAIN_IDs.HYPEREVM_TESTNET);

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
      "0x3f51b87ae65548ab996bdbb363f2553a311ef43e",
    );
    expect(
      ethers.utils.toUtf8String(
        ethers.utils.arrayify(decodedHookData.magicBytes),
      ),
    ).to.contain("cctp-forward");
    expect(decodedHookData.versionId).to.equal(0);
  }).timeout(10000);
});
