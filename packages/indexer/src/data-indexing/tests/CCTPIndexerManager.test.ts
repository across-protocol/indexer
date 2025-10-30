import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import sinon from "sinon";
import { getTestDataSource } from "../../tests/setup";
import { CCTPRepository } from "../../database/CctpRepository";
import { parseProvidersUrls, Config } from "../../parseEnv";
import { assert } from "@repo/error-handling";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities } from "../../../../indexer-database/dist/src";
import { CCTPIndexerManager } from "../service/CCTPIndexerManager";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import * as CCTPIndexerManagerModule from "../service/CCTPIndexerManager";
import { EvmIndexer } from "../service/Indexer";
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
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
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

  it("should store sponsoredDepositForBurn event in the database", async () => {
    const filterStub = sinon
      .stub(
        CCTPIndexerDataHandler.prototype,
        "filterTransactionsFromSwapApi" as any,
      )
      .resolvesArg(1);
    const startIndexingStub = sinon
      .stub(CCTPIndexerDataHandler.prototype, "getStartIndexingBlockNumber")
      .returns(blockNumber);
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
    const getBlockNumberStub = sinon
      .stub(provider, "getBlockNumber")
      .resolves(blockNumber);
    const indexerPromise = manager.start();

    // Wait for the indexer to process the block
    await across.utils.delay(2);

    const sponsoredDepositForBurnRepository = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    const savedEvent = await sponsoredDepositForBurnRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    await manager.stopGracefully();
    console.log("Stopping indexer...");
    await indexerPromise;
    console.log("Saved Event:", savedEvent);
    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);

    if ((provider as any).destroy) {
      (provider as any).destroy();
    }

    filterStub.restore();
    startIndexingStub.restore();
    getBlockNumberStub.restore();
    noTtlStub.restore();
    delayStub.restore();
    bufferStub.restore();
  }).timeout(20000);
});
