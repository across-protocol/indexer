import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import sinon from "sinon";
import { getTestDataSource } from "../../tests/setup";
import { CCTPRepository } from "../../database/CctpRepository";
import { parseProvidersUrls, Config } from "../../parseEnv";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities } from "@repo/indexer-database";
import { CCTPIndexerManager } from "../service/CCTPIndexerManager";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import * as CCTPIndexerManagerModule from "../service/CCTPIndexerManager";
import { CCTPIndexerDataHandler } from "../service/CCTPIndexerDataHandler";
import { RedisCache } from "../../redis/redisCache";
import * as Web3Constants from "../../web3/constants";
import * as Constants from "../service/constants";

describe("CCTPIndexerManager", () => {
  let dataSource: DataSource;
  let cctpRepository: CCTPRepository;
  let logger: Logger;
  let manager: CCTPIndexerManager;
  let retryProvidersFactory: RetryProvidersFactory;

  const transactionHash =
    "0xcb92b553ebf00a2fff5ab04d4966b5a1d4a37afec858308e4d87ef12bea63576";
  const blockNumber = 209540538;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    cctpRepository = new CCTPRepository(dataSource, logger);

    const providerUrls = parseProvidersUrls();
    const config = {
      enableCctpIndexer: true,
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

    // Mock to only use ARBITRUM_SEPOLIA for this test
    sinon
      .stub(CCTPIndexerManagerModule, "CCTP_SUPPORTED_CHAINS")
      .value([CHAIN_IDs.ARBITRUM_SEPOLIA]);

    manager = new CCTPIndexerManager(
      logger,
      config,
      dataSource,
      retryProvidersFactory,
      cctpRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  /**
   * This test verifies that the CCTPIndexerManager can correctly process and store
   * a SponsoredDepositForBurn event. It is an integration test that lets the real indexer run
   * for a short period and then checks for the expected side-effects in the database.
   */
  it("should store sponsoredDepositForBurn event in the database", async () => {
    // Stub to prevent the data handler from filtering out the transaction used in the test.
    const filterStub = sinon
      .stub(
        CCTPIndexerDataHandler.prototype,
        "filterTransactionsFromSwapApi" as any,
      )
      .resolvesArg(1);
    // Stub to force the indexer to start processing from the block number of the test transaction.
    const startIndexingStub = sinon
      .stub(CCTPIndexerDataHandler.prototype, "getStartIndexingBlockNumber")
      .returns(blockNumber);
    // Stub constants to prevent errors due to missing configuration for the test chain.
    const noTtlStub = sinon
      .stub(Web3Constants, "getNoTtlBlockDistance")
      .returns(0);
    const delayStub = sinon
      .stub(Constants, "getIndexingDelaySeconds")
      .returns(0);
    const bufferStub = sinon
      .stub(Constants, "getFinalisedBlockBufferDistance")
      .returns(0);

    const provider = retryProvidersFactory.getCustomEvmProvider({
      chainId: CHAIN_IDs.ARBITRUM_SEPOLIA,
      enableCaching: false,
    }) as across.providers.RetryProvider;
    // Stub to control the block range and ensure the indexer processes the target block.
    const getBlockNumberStub = sinon
      .stub(provider, "getBlockNumber")
      .resolves(blockNumber);

    const indexerPromise = manager.start();

    // Wait a moment for the indexer to run and process the block.
    await across.utils.delay(2);

    const sponsoredDepositForBurnRepository = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    const savedEvent = await sponsoredDepositForBurnRepository.findOne({
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
    filterStub.restore();
    startIndexingStub.restore();
    getBlockNumberStub.restore();
    noTtlStub.restore();
    delayStub.restore();
    bufferStub.restore();
  }).timeout(20000);
});
