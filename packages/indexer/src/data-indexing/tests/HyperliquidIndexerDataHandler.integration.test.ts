import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import sinon from "sinon";
import { entities } from "@repo/indexer-database";
import { HyperliquidIndexerDataHandler } from "../service/HyperliquidIndexerDataHandler";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";
import {
  HyperliquidRpcClient,
  HyperliquidBlock,
} from "../adapter/hyperliquid/HyperliquidRpcClient";
import { BlockRange } from "../model";
import { getTestDataSource } from "../../tests/setup";

describe("HyperliquidIndexerDataHandler", () => {
  let dataSource: DataSource;
  let hyperliquidRepository: HyperliquidRepository;
  let logger: Logger;
  let handler: HyperliquidIndexerDataHandler;
  let rpcClientStub: sinon.SinonStub;

  const mockRpcUrl = "https://test-rpc-url.com/hypercore";
  const mockBlockNumber = 859481445;
  const mockTransactionHash = "0x1234567890abcdef1234567890abcdef12345678";

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    hyperliquidRepository = new HyperliquidRepository(dataSource, logger);

    handler = new HyperliquidIndexerDataHandler(
      logger,
      mockRpcUrl,
      hyperliquidRepository,
      0,
    );

    // Stub the HyperliquidRpcClient constructor to return a mock
    rpcClientStub = sinon.stub(
      HyperliquidRpcClient.prototype,
      "getBatchBlocks",
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should process a block range and store Hyperliquid deposit event", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      data: [
        {
          txHash: mockTransactionHash,
          txIndex: 0,
          logIndex: 0,
          timestamp: new Date().toISOString(),
          user: "0x2222222222222222222222222222222222222222",
          amount: "1000000000000000000",
          token: "USDC",
          type: "deposit",
          nonce: "12345",
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposit = await hyperliquidDepositRepo.findOne({
      where: {
        blockNumber: mockBlockNumber,
        transactionHash: mockTransactionHash,
      },
    });

    expect(savedDeposit).to.exist;
    expect(savedDeposit!.transactionHash).to.equal(mockTransactionHash);
    expect(savedDeposit!.blockNumber).to.equal(mockBlockNumber);
    expect(savedDeposit!.user).to.equal(
      "0x2222222222222222222222222222222222222222",
    );
    expect(savedDeposit!.amount.toString()).to.equal("1000000000000000000");
    expect(savedDeposit!.token).to.equal("USDC");
    expect(savedDeposit!.depositType).to.equal("deposit");
    expect(savedDeposit!.nonce).to.equal("12345");
    expect(savedDeposit!.finalised).to.be.true;
  }).timeout(20000);

  it("should handle events with missing transactionHash by using empty string", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response without txHash
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      data: [
        {
          txIndex: 0,
          logIndex: 0,
          timestamp: new Date().toISOString(),
          user: "0x2222222222222222222222222222222222222222",
          amount: "500000000000000000",
          token: "USDT",
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposit = await hyperliquidDepositRepo.findOne({
      where: {
        blockNumber: mockBlockNumber,
        transactionHash: "",
      },
    });

    expect(savedDeposit).to.exist;
    expect(savedDeposit!.transactionHash).to.equal("");
    expect(savedDeposit!.user).to.equal(
      "0x2222222222222222222222222222222222222222",
    );
    expect(savedDeposit!.amount.toString()).to.equal("500000000000000000");
    expect(savedDeposit!.token).to.equal("USDT");
  }).timeout(20000);

  it("should handle empty block data", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response with empty data
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      data: [],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposits = await hyperliquidDepositRepo.find({
      where: {
        blockNumber: mockBlockNumber,
      },
    });

    expect(savedDeposits).to.have.length(0);
  }).timeout(20000);

  it("should process multiple blocks in a range", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber + 2,
    };

    // Mock the RPC response with multiple blocks
    const mockBlocks: HyperliquidBlock[] = [
      {
        blockNumber: mockBlockNumber,
        data: [
          {
            txHash: `${mockTransactionHash}1`,
            txIndex: 0,
            logIndex: 0,
            timestamp: new Date().toISOString(),
            user: "0x2222222222222222222222222222222222222222",
            amount: "1000000000000000000",
            token: "USDC",
          },
        ],
      },
      {
        blockNumber: mockBlockNumber + 1,
        data: [
          {
            txHash: `${mockTransactionHash}2`,
            txIndex: 0,
            logIndex: 0,
            timestamp: new Date().toISOString(),
            user: "0x2222222222222222222222222222222222222222",
            amount: "2000000000000000000",
            token: "USDT",
          },
        ],
      },
      {
        blockNumber: mockBlockNumber + 2,
        data: [],
      },
    ];

    rpcClientStub.resolves(mockBlocks);

    await handler.processBlockRange(blockRange, mockBlockNumber + 2);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposits = await hyperliquidDepositRepo.find({
      where: [
        { blockNumber: mockBlockNumber },
        { blockNumber: mockBlockNumber + 1 },
      ],
    });

    expect(savedDeposits).to.have.length(2);
    expect(savedDeposits.find((d) => d.blockNumber === mockBlockNumber)).to
      .exist;
    expect(savedDeposits.find((d) => d.blockNumber === mockBlockNumber + 1)).to
      .exist;
  }).timeout(20000);
});
