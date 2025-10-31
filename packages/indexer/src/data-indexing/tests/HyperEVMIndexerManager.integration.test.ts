import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import sinon from "sinon";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities } from "@repo/indexer-database";
import { HyperEVMIndexerManager } from "../service/HyperEVMIndexerManager";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { HyperEVMIndexerDataHandler } from "../service/HyperEVMIndexerDataHandler";
import { RedisCache } from "../../redis/redisCache";
import { parseProvidersUrls, Config } from "../../parseEnv";
import { getTestDataSource } from "../../tests/setup";
import { SimpleTransferFlowCompletedRepository } from "../../database/SimpleTransferFlowCompletedRepository";
import { SwapFlowInitializedRepository } from "../../database/SwapFlowInitializedRepository";

describe("HyperEVMIndexerManager", () => {
  let dataSource: DataSource;
  let simpleTransferFlowCompletedRepository: SimpleTransferFlowCompletedRepository;
  let swapFlowInitializedRepository: SwapFlowInitializedRepository;
  let logger: Logger;
  let manager: HyperEVMIndexerManager;
  let retryProvidersFactory: RetryProvidersFactory;

  const transactionHash =
    "0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9";
  const blockNumber = 36200188;
  const chainId = CHAIN_IDs.HYPEREVM_TESTNET;

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

    const providerUrls = parseProvidersUrls();
    const config = {
      enableHyperEVMIndexer: true,
      providerUrls,
      indexingDelaySecondsOnError: 2,
    } as unknown as Config;

    const redisCache = {
      redis: {} as any,
      get: sinon.stub(),
      set: sinon.stub(),
      pub: sinon.stub(),
      sub: sinon.stub(),
    } as unknown as RedisCache;

    retryProvidersFactory = new RetryProvidersFactory(redisCache, logger);

    manager = new HyperEVMIndexerManager(
      logger,
      config,
      dataSource,
      retryProvidersFactory,
      simpleTransferFlowCompletedRepository,
      swapFlowInitializedRepository,
      true,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should store SimpleTransferFlowCompleted event in the database", async () => {
    // Stub to force the indexer to start processing from the block number of the test transaction.
    const startIndexingStub = sinon
      .stub(HyperEVMIndexerDataHandler.prototype, "getStartIndexingBlockNumber")
      .returns(blockNumber);

    const provider = retryProvidersFactory.getCustomEvmProvider({
      chainId: chainId,
      enableCaching: false,
    }) as across.providers.RetryProvider;
    // Stub to control the block range and ensure the indexer processes the target block.
    const getBlockNumberStub = sinon
      .stub(provider, "getBlockNumber")
      .resolves(blockNumber);

    const indexerPromise = manager.start();
    // Wait a moment for the indexer to run and process the block.
    await across.utils.delay(2);

    const simpleTransferFlowCompletedRepository = dataSource.getRepository(
      entities.SimpleTransferFlowCompleted,
    );
    const savedEvent =
      await simpleTransferFlowCompletedRepository.findOneOrFail({
        where: { transactionHash: transactionHash },
      });

    // Gracefully stop the indexer and wait for it to shut down.
    await manager.stopGracefully();
    await indexerPromise;
    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);

    // Clean up the provider to close any open connections.
    if ((provider as any).destroy) {
      (provider as any).destroy();
    }

    // Restore all stubs.
    startIndexingStub.restore();
    getBlockNumberStub.restore();
  }).timeout(20000);
});
