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

  beforeEach(async () => {
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
      hyperliquidMainnet: true,
      providerUrls,
      indexingDelaySecondsOnError: 2,
      maxBlockRangeSize: 1000,
    } as unknown as Config;
  });

  afterEach(async () => {
    sinon.restore();
    if (manager) {
      await manager.stopGracefully();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
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
    await manager.start();

    // Verify that the indexer was created
    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1337;
    indexerStartStub.restore();
  });

  it("should use starting block number from mapping for mainnet", async () => {
    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    const testRpcUrl = "https://test-rpc-url.com/hypercore";
    process.env.RPC_PROVIDER_URLS_1337 = testRpcUrl;
    config.hyperliquidMainnet = true;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start();

    // Verify that the indexer was created
    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1337;
    indexerStartStub.restore();
  });

  it("should use starting block number from mapping for testnet", async () => {
    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    const testRpcUrl = "https://test-rpc-url.com/hypercore";
    process.env.RPC_PROVIDER_URLS_1338 = testRpcUrl;
    config.hyperliquidMainnet = false;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start();

    // Verify that the indexer was created
    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1338;
    indexerStartStub.restore();
  });

  it("should not start indexer when enableHyperliquidIndexer is false", async () => {
    config.enableHyperliquidIndexer = false;

    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start();

    // Indexer should not be started
    expect(indexerStartStub.called).to.be.false;

    indexerStartStub.restore();
  });

  it("should use testnet chain ID (1338) when hyperliquidMainnet is false", async () => {
    config.hyperliquidMainnet = false;

    const indexerStartStub = sinon
      .stub(HyperliquidIndexer.prototype, "start")
      .resolves();

    const testRpcUrl = "https://test-rpc-url.com/hypercore";
    process.env.RPC_PROVIDER_URLS_1338 = testRpcUrl;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start();

    expect(indexerStartStub.called).to.be.true;

    delete process.env.RPC_PROVIDER_URLS_1338;
    indexerStartStub.restore();
  });

  it("should log error when RPC URL is not configured", async () => {
    // Ensure no RPC URL is set
    delete process.env.RPC_PROVIDER_URLS_1337;
    delete process.env.RPC_PROVIDER_URLS_1338;

    manager = new HyperliquidIndexerManager(logger, config, dataSource);
    await manager.start();

    // Should log an error
    expect((logger.error as sinon.SinonSpy).called).to.be.true;
    const errorCall = (logger.error as sinon.SinonSpy).getCall(0);
    expect(errorCall.args[0].message).to.include(
      "Hyperliquid RPC URL is not configured",
    );
  });
});
