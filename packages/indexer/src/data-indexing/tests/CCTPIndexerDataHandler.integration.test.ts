import { expect } from "chai";
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
    // Re-initialize handler for HyperEVM testnet
    setupTestForChainId(CHAIN_IDs.HYPEREVM_TESTNET);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterTransactionsFromAcrossFinalizer method to avoid filtering out our test transaction
    sinon
      .stub(handler as any, "filterTransactionsFromAcrossFinalizer")
      .returnsArg(0);

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
});
