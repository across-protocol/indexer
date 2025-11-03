import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import * as sinon from "sinon";
import { getTestDataSource } from "../../tests/setup";
import { HyperEVMIndexerDataHandler } from "../service/HyperEVMIndexerDataHandler";
import { SimpleTransferFlowCompletedRepository } from "../../database/SimpleTransferFlowCompletedRepository";
import { SwapFlowInitializedRepository } from "../../database/SwapFlowInitializedRepository";
import { SwapFlowFinalizedRepository } from "../../database/SwapFlowFinalizedRepository";
import { BlockRange } from "../model";
import { createTestRetryProvider } from "../../tests/testProvider";
import { entities } from "../../../../indexer-database/dist/src";
import { CHAIN_IDs } from "@across-protocol/constants";

describe("HyperEVMIndexerDataHandler", () => {
  let dataSource: DataSource;
  let simpleTransferFlowCompletedRepository: SimpleTransferFlowCompletedRepository;
  let swapFlowInitializedRepository: SwapFlowInitializedRepository;
  let swapFlowFinalizedRepository: SwapFlowFinalizedRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: HyperEVMIndexerDataHandler;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    simpleTransferFlowCompletedRepository =
      new SimpleTransferFlowCompletedRepository(dataSource, logger);
    swapFlowInitializedRepository = new SwapFlowInitializedRepository(
      dataSource,
      logger,
    );
    swapFlowFinalizedRepository = new SwapFlowFinalizedRepository(
      dataSource,
      logger,
    );
    provider = createTestRetryProvider(CHAIN_IDs.HYPEREVM_TESTNET, logger);

    handler = new HyperEVMIndexerDataHandler(
      logger,
      CHAIN_IDs.HYPEREVM_TESTNET,
      provider,
      simpleTransferFlowCompletedRepository,
      swapFlowInitializedRepository,
      swapFlowFinalizedRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should fetch events for a given block range including a sample transaction", async () => {
    const transactionHash =
      "0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9";
    const blockNumber = 36200188;

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    const events = await (handler as any).fetchEventsByRange(blockRange);

    const foundEvent = events.simpleTransferFlowCompletedEvents.find(
      (e: any) => e.transactionHash === transactionHash,
    );
    expect(foundEvent).to.exist;
    expect(foundEvent.transactionHash).to.equal(transactionHash);
    expect(foundEvent.blockNumber).to.equal(blockNumber);
  }).timeout(10000);

  it("should store SimpleTransferFlowCompleted event in the database", async () => {
    const transactionHash =
      "0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9";
    const blockNumber = 36200188;

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    await handler.processBlockRange(blockRange, blockNumber);

    const repo = dataSource.getRepository(entities.SimpleTransferFlowCompleted);
    const savedEvent = await repo.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(10000);
});
