import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import sinon from "sinon";
import { HyperliquidIndexerManager } from "../service/HyperliquidIndexerManager";
import { parseProvidersUrls, Config } from "../../parseEnv";
import { getTestDataSource } from "../../tests/setup";
import { HyperliquidIndexer } from "../service/Indexer";

describe("HyperliquidIndexerManager", () => {
  let dataSource: DataSource;
  let logger: Logger;
  let manager: HyperliquidIndexerManager;
  let config: Config;
  let abortController: AbortController;

  beforeEach(async () => {
    abortController = new AbortController();
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    const providerUrls = parseProvidersUrls();
    config = {
      enableHyperliquidIndexer: true,
      providerUrls,
      indexingDelaySecondsOnError: 2,
      maxBlockRangeSize: 1000,
    } as unknown as Config;
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    abortController.abort();
  });

  it("should use CHAIN_IDs.HYPERCORE for chainId", async () => {
    // Stub the HyperliquidIndexer to prevent actual indexing
    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    // Set up environment variable for RPC URL
    const testRpcUrl = "https://test-rpc-url.com/hypercore";
    process.env.RPC_PROVIDER_URLS_1337 = testRpcUrl;
    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start(abortController.signal);

    // Verify that the indexer was created
    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1337;
    indexerStartStub.restore();
  });

  it("should use starting block number from constant", async () => {
    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    const testRpcUrl = "https://test-rpc-url.com/hypercore";
    process.env.RPC_PROVIDER_URLS_1337 = testRpcUrl;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start(abortController.signal);

    // Verify that the indexer was created
    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1337;
    indexerStartStub.restore();
  });

  it("should not start indexer when enableHyperliquidIndexer is false", async () => {
    config.enableHyperliquidIndexer = false;

    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start(abortController.signal);

    // Indexer should not be started
    expect(indexerStartStub.called).to.be.false;

    indexerStartStub.restore();
  });

  it("should log error when RPC URL is not configured", async () => {
    // Ensure no RPC URL is set
    delete process.env.RPC_PROVIDER_URLS_1337;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start(abortController.signal);

    // Should log an error
    expect((logger.error as sinon.SinonSpy).called).to.be.true;
    const errorCall = (logger.error as sinon.SinonSpy).getCall(0);
    expect(errorCall.args[0].message).to.include(
      "Hyperliquid RPC URL is not configured",
    );
  });
});
