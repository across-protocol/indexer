import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import sinon from "sinon";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities } from "@repo/indexer-database";
import { OFTIndexerManager } from "../service/OFTIndexerManager";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import * as OFTIndexerManagerModule from "../service/OFTIndexerManager";
import { OFTIndexerDataHandler } from "../service/OFTIndexerDataHandler";
import { RedisCache } from "../../redis/redisCache";
import { parseProvidersUrls, Config } from "../../parseEnv";
import { getTestDataSource } from "../../tests/setup";
import { OftRepository } from "../../database/OftRepository";

describe("OFTIndexerManager", () => {
  let dataSource: DataSource;
  let oftRepository: OftRepository;
  let logger: Logger;
  let manager: OFTIndexerManager;
  let retryProvidersFactory: RetryProvidersFactory;

  const transactionHash =
    "0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a";
  const blockNumber = 168661609;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    oftRepository = new OftRepository(dataSource, logger);

    const providerUrls = parseProvidersUrls();
    const config = {
      enableOftIndexer: true,
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

    sinon
      .stub(OFTIndexerManagerModule, "getSupportOftChainIds" as any)
      .returns([CHAIN_IDs.ARBITRUM]);

    manager = new OFTIndexerManager(
      logger,
      config,
      dataSource,
      retryProvidersFactory,
      oftRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should store SponsoredOFTSend event in the database", async () => {
    const filterStub = sinon
      .stub(
        OFTIndexerDataHandler.prototype,
        "filterTransactionsFromSwapApi" as any,
      )
      .resolvesArg(1);
    const startIndexingStub = sinon
      .stub(OFTIndexerDataHandler.prototype, "getStartIndexingBlockNumber")
      .returns(blockNumber);

    const provider = retryProvidersFactory.getCustomEvmProvider({
      chainId: CHAIN_IDs.ARBITRUM,
      enableCaching: false,
    }) as across.providers.RetryProvider;
    const getBlockNumberStub = sinon
      .stub(provider, "getBlockNumber")
      .resolves(blockNumber);

    const indexerPromise = manager.start();

    await across.utils.delay(2);

    const sponsoredOFTSendRepo = dataSource.getRepository(
      entities.SponsoredOFTSend,
    );
    const savedEvent = await sponsoredOFTSendRepo.findOne({
      where: { transactionHash: transactionHash },
    });

    await manager.stopGracefully();
    await indexerPromise;

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);

    if ((provider as any).destroy) {
      (provider as any).destroy();
    }

    filterStub.restore();
    startIndexingStub.restore();
    getBlockNumberStub.restore();
  }).timeout(20000);
});
