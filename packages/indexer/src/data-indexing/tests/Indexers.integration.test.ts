import { expect } from "chai";
import { DataSource } from "typeorm";
import { getTestDataSource } from "../../tests/setup";
import { startChainIndexing } from "../service/indexing";
import { MockWebSocketRPCServer } from "../../tests/testProvider";
import { utils as dbUtils } from "@repo/indexer-database";
import * as contractUtils from "../../utils/contractUtils";
import { entities, DataSourceType } from "@repo/indexer-database";
import sinon from "sinon";
import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import { createPublicClient, http, PublicClient } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  hyperEvm,
  mainnet,
  optimism,
} from "viem/chains";
import {
  CCTP_PROTOCOL,
  SPONSORED_CCTP_PROTOCOL,
  OFT_PROTOCOL,
  SPOKE_POOL_PROTOCOL,
} from "../service/config";
import { safeJsonStringify } from "../../utils/map";

// Setup generic client for fetching data
const getTestPublicClient = (chainId: number): PublicClient => {
  let chain;
  let transportUrl;

  if (chainId === CHAIN_IDs.ARBITRUM) {
    chain = arbitrum;
    transportUrl = process.env.RPC_PROVIDER_URLS_42161?.split(",")[0];
  } else if (chainId === CHAIN_IDs.ARBITRUM_SEPOLIA) {
    chain = arbitrumSepolia;
    transportUrl = process.env.RPC_PROVIDER_URLS_421614?.split(",")[0];
  } else if (chainId === CHAIN_IDs.HYPEREVM) {
    chain = hyperEvm;
    transportUrl = process.env.RPC_PROVIDER_URLS_999?.split(",")[0];
  } else if (chainId === CHAIN_IDs.MAINNET) {
    chain = mainnet;
    transportUrl = process.env.RPC_PROVIDER_URLS_1?.split(",")[0];
  } else if (chainId === CHAIN_IDs.OPTIMISM) {
    chain = optimism;
    transportUrl = process.env.RPC_PROVIDER_URLS_10?.split(",")[0];
  } else {
    throw new Error(`Unsupported chainId for test client: ${chainId}`);
  }
  if (!transportUrl) {
    throw new Error(`No transport URL found for chainId: ${chainId}`);
  }

  return createPublicClient({
    chain,
    transport: http(transportUrl),
  }) as PublicClient;
};

const fetchAndMockTransaction = async (
  server: MockWebSocketRPCServer,
  client: PublicClient,
  txHash: `0x${string}`,
) => {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({
    blockNumber: receipt.blockNumber,
    includeTransactions: true,
  });

  // Helper to convert Viem formatted objects back to JSON-RPC hex strings
  const toRpcFormat = (val: any, key?: string): any => {
    if (val === null || val === undefined) return val;
    if (typeof val === "bigint") return `0x${val.toString(16)}`;
    if (typeof val === "number") {
      // Log index, block number, etc. should be hex strings
      return `0x${val.toString(16)}`;
    }
    if (typeof val === "boolean") return val ? "0x1" : "0x0";
    if (Array.isArray(val)) return val.map((item) => toRpcFormat(item));
    if (typeof val === "object") {
      const out: any = {};
      for (const k in val) {
        // Special handling for status which is "success" | "reverted" in Viem
        if (k === "status" && val[k] === "success") {
          out[k] = "0x1";
          continue;
        }
        if (k === "status" && val[k] === "reverted") {
          out[k] = "0x0";
          continue;
        }
        // Type is separate. Viem: 'eip1559'. RPC: '0x2'
        if (k === "type") {
          if (val[k] === "eip1559") {
            out[k] = "0x2";
            continue;
          }
          if (val[k] === "eip2930") {
            out[k] = "0x1";
            continue;
          }
          if (val[k] === "legacy") {
            out[k] = "0x0";
            continue;
          }
          // If it's already hex or other string
        }

        out[k] = toRpcFormat(val[k], k);
      }
      return out;
    }
    return val;
  };

  const serializedBlock = toRpcFormat(block);
  // Ensure we define transactions as generic array if needed, but toRpcFormat handles recursing
  server.mockBlockResponse(serializedBlock);

  const serializedReceipt = toRpcFormat(receipt);
  server.mockTransactionReceiptResponse(txHash, serializedReceipt);
  return {
    block,
    receipt,
  };
};

describe("Websocket Subscription", () => {
  let dataSource: DataSource;
  let blockchainRepository: dbUtils.BlockchainEventRepository;
  let server: MockWebSocketRPCServer;
  let rpcUrl: string;
  let logger: Logger;
  let abortController: AbortController;

  /**
   * Sets up the data source and blockchain repository before each test.
   */
  beforeEach(async () => {
    dataSource = await getTestDataSource();
    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: console.error,
    } as unknown as Logger;
    blockchainRepository = new dbUtils.BlockchainEventRepository(
      dataSource,
      logger,
    );
    abortController = new AbortController();
    server = new MockWebSocketRPCServer();
    rpcUrl = await server.start();
  });

  /**
   * Cleans up the data source each test.
   */
  afterEach(async function () {
    this.timeout(20000);

    // Close the database
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }

    abortController.abort();

    // Stop the server.
    await server.stop();
    sinon.restore();
  });

  /**
   * Tests ingesting a DepositForBurn event from a specific Arbitrum Sepolia transaction.
   */
  it("should ingest the DepositForBurn event from Arbitrum tx 0xabb...69f7", async () => {
    const txHash =
      "0x063cac1df9697e1f87ee57b7d56a4bdb58447ca9d88c113fd576a44d3c842b1d";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer with the real repository
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    // Wait for the indexer to subscribe
    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM).length,
    );

    // Push the events to the WebSocket
    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      // --- Chain Context ---
      chainId: CHAIN_IDs.ARBITRUM, // Arbitrum One
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 11,
      logIndex: 12,
      finalised: false, // Should be false initially for WS events
      // --- CCTP Event Data ---
      burnToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      amount: 1000000, // 1 USDC (6 decimals)
      maxFee: 100,
      depositor: "0xce1FFE01eBB4f8521C12e74363A396ee3d337E1B",
      mintRecipient: "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f",
      destinationDomain: 19,
      destinationTokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      destinationCaller: "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f",

      minFinalityThreshold: 1000,

      // We verify the hookData matches exactly
      hookData:
        "0xca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
    expect(savedEvent!.deletedAt).to.be.null;
    expect(savedEvent!.finalizerJob).to.be.undefined;
  }).timeout(20000);

  it("should ingest the MessageSent event from Arbitrum tx 0x063...2b1d", async () => {
    const txHash =
      "0x063cac1df9697e1f87ee57b7d56a4bdb58447ca9d88c113fd576a44d3c842b1d";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM).length,
    );
    // Push the events to the WebSocket
    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const messageSentRepo = dataSource.getRepository(entities.MessageSent);
    const savedEvent = await messageSentRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 11,
      logIndex: 11,
      finalised: false,
      version: 1,
      sourceDomain: 3,
      destinationDomain: 19,
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      sender: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      recipient: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      destinationCaller: "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f",
      minFinalityThreshold: 1000,
      finalityThresholdExecuted: 0,
      messageBody:
        "0x00000001000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e58310000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce1ffe01ebb4f8521c12e74363a396ee3d337e1b000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
      message:
        "0x000000010000000300000013000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d00000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d0000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f000003e80000000000000001000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e58310000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce1ffe01ebb4f8521c12e74363a396ee3d337e1b000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
  }).timeout(20000);
  it("should ingest the MessageReceived event from Arbitrum tx 0x3846...f049", async () => {
    // Real Transaction Data taken from:
    // https://arbiscan.io/tx/0x384656c6c3243982e130b3f7024f8677a5791ea8cab9e11cf7013abb7b03f049#eventlog#36
    const txHash =
      "0x384656c6c3243982e130b3f7024f8677a5791ea8cab9e11cf7013abb7b03f049";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM).length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    const messageBody =
      "00000001C6FA7AF3BEDBAD3A3D65F36AABC97431B1BBE4C2D2F6E0E47CA60203452F5D61000000000000000000000000AEECE9A1F996226C026BB05E7561830872385A59000000000000000000000000000000000000000000000000000000037E11D600455B0EAACAC3285754B398CE32FA37EF6846ACBE1D7A09E0A8EF006FF7110412000000000000000000000000000000000000000000000000000000000016E361000000000000000000000000000000000000000000000000000000000016E36000000000000000000000000000000000000000000000000000000000016DBBAF";

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 500));

    // Verify Persistence
    const messageReceivedRepo = dataSource.getRepository(
      entities.MessageReceived,
    );
    const savedEvent = await messageReceivedRepo.findOne({
      where: { transactionHash: txHash },
    });

    // Basic Existence Check
    expect(savedEvent).to.exist;

    // Detailed Field Verification
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 7,
      logIndex: 36,
      finalised: false,

      // Specific Event Data
      caller: "0x72adB07A487f38321b6665c02D289C413610B081",
      nonce:
        "0xbf423e1a36b969577de2b0b84e5d80f9386e452f6e1325497fad900b3905fdbe", // Lowercase for db consistency
      sourceDomain: 5,
      // The origin is Solana
      sender: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe", // Transformed from bytes32 to address for domain 5
      finalityThresholdExecuted: 1000,
      messageBody: "0x" + messageBody.toLowerCase(),
    });
  }).timeout(20000);
  it("should ingest the SwapFlowInitialized event from HyperEVM tx 0xfd60...4779", async () => {
    // Tx: https://hyperevmscan.io/tx/0xfd60b3c77fa72557a747ca537adbfd8578f26c045bc8dfc6b248eb3300834779
    const txHash =
      "0xfd60b3c77fa72557a747ca537adbfd8578f26c045bc8dfc6b248eb3300834779";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    // Contracts can be redeployed, so we need to stub the periphery address to keep the tests from failing if the contract is redeployed
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f");

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      SPONSORED_CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.HYPEREVM)
        .length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify SwapFlowInitialized
    const initializedRepo = dataSource.getRepository(
      entities.SwapFlowInitialized,
    );
    const savedInitialized = await initializedRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedInitialized).to.exist;
    expect(savedInitialized).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0xe887e72e2b5dd7ea466bb32701b0e45cc862f4bda3887192f346eb26733d3f4c",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      evmAmountIn: 10998900,
      bridgingFeesIncurred: 1100,
      coreAmountIn: 1099890000,
      minAmountToSend: 1100000000,
      maxAmountToSend: 1100000000,
      dataSource: "websocket",
    });
  }).timeout(20000);
  it("should ingest SwapFlowFinalized event from HyperEVM tx 0x15d5...fbd3", async () => {
    // Tx: https://hyperevmscan.io/tx/0x15d5b49cece7e1c90ca03074c809e02ffefa40112f9051aa681d18d856f6fbd3
    const txHash =
      "0x15d5b49cece7e1c90ca03074c809e02ffefa40112f9051aa681d18d856f6fbd3";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    // Contracts can be redeployed, so we need to stub the periphery address to keep the tests from failing if the contract is redeployed
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      SPONSORED_CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.HYPEREVM)
        .length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const finalizedRepo = dataSource.getRepository(entities.SwapFlowFinalized);
    const savedFinalized = await finalizedRepo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedFinalized).to.exist;
    expect(savedFinalized).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0xe887e72e2b5dd7ea466bb32701b0e45cc862f4bda3887192f346eb26733d3f4c",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      totalSent: 1100000000,
      evmAmountSponsored: 11539,
      dataSource: "websocket",
    });
  }).timeout(20000);
  it("should ingest the DepositForBurn event from Ethereum tx 0x1945...ee93", async () => {
    const txHash =
      "0x1945f68534f3e599b1229c6317672bdbab930061bbb4dc00f96c30da5d4aee93";

    const client = getTestPublicClient(CHAIN_IDs.MAINNET);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      client,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.MAINNET,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.MAINNET).length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.MAINNET,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      burnToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      amount: 1000000,
      depositor: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      mintRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      destinationDomain: 3,
      destinationTokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      destinationCaller: "0x72adB07A487f38321b6665c02D289C413610B081",
      maxFee: 100,
      minFinalityThreshold: 1000,
      hookData: "0x",
    });
  }).timeout(20000);
  it("should ingest sponsored CCTP events from Arbitrum tx 0xef55...78a0", async () => {
    // Tx: https://arbiscan.io/tx/0xef55d3110094488b943525fd6609e7918328009168e661658b5fb858434b78a0
    const txHash =
      "0xef55d3110094488b943525fd6609e7918328009168e661658b5fb858434b78a0";

    const client = getTestPublicClient(CHAIN_IDs.ARBITRUM);

    // Stub contract Utils for finding the sponsored event from the periphery address
    // The previous test suite (CCTPIndexerDataHandler) used:
    // SponsoredCCTPSrcPeriphery: 0xAA4958EFa0Cf6DdD87e354a90785f1D7291a82c7
    sinon
      .stub(contractUtils, "getSponsoredCCTPSrcPeripheryAddress")
      .returns("0xAA4958EFa0Cf6DdD87e354a90785f1D7291a82c7");

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      client,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });
    await server.waitForSubscription(
      SPONSORED_CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM)
        .length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify DepositForBurn Persistence
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(txHash);

    // Verify SponsoredDepositForBurn Persistence
    const sponsoredRepo = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    const savedSponsoredEvent = await sponsoredRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedSponsoredEvent).to.exist;
    expect(savedSponsoredEvent!).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      quoteNonce:
        "0x333d757477a9ebed33ed12e6320a8414d034cd86ca2acd292d9b687a99bdb866",
      originSender: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      quoteDeadline: new Date(1765996920 * 1000),
      maxBpsToSponsor: 0,
      maxUserSlippageBps: 50,
      finalToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      signature:
        "0x1ed01ce81157c25664616c112142037217f5b22318f451eb7f6eb07d2784810a00c1d0f648a6687fcd3dccfe7c37660c7e378dbc0c2a49a917d6b016cdb8f8571c",
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);
  it("should ingest the MintAndWithdraw event from Arbitrum tx 0x3b3d...e813", async () => {
    // Real Transaction Data
    const txHash =
      "0x3b3d12449bc5b30a64e234f3871983ca12ebaaa020998854a8ee94d92bd7e813";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM).length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const repo = dataSource.getRepository(entities.MintAndWithdraw);
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 2,
      logIndex: 2,
      finalised: false,
      amount: 1000000,
      feeCollected: 0,
      mintRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      mintToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);
  it("should ingest the DepositForBurn event from Optimism tx 0x56e0...99c3", async () => {
    const txHash =
      "0x56e01f96998b7a7074a6866aacf3fb987a1802c7abeb96d6354f8b9b699c3941";

    const client = getTestPublicClient(CHAIN_IDs.OPTIMISM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      client,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.OPTIMISM,
      protocols: [CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      CCTP_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.OPTIMISM).length,
    );

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.OPTIMISM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      burnToken: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      amount: 1000000,
      depositor: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      mintRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      destinationDomain: 3,
      destinationTokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      destinationCaller: "0x72adB07A487f38321b6665c02D289C413610B081",
      maxFee: 100,
      minFinalityThreshold: 1000,
      hookData: "0x",
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);
  it("should ingest the SimpleTransferFlowCompleted event from HyperEVM tx 0x0e07...0abb", async () => {
    // Tx: https://hyperevmscan.io/tx/0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb
    const txHash =
      "0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    // Stub the periphery address for this test
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const repo = dataSource.getRepository(entities.SimpleTransferFlowCompleted);
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0x900ae297e854a869531be43d57f0da808207132313de1a986558eefcac41a89c",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      evmAmountIn: 100003,
      bridgingFeesIncurred: 11,
      evmAmountSponsored: 11,
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);

  it("should ingest the ArbitraryActionsExecuted event from HyperEVM tx 0x0e07...0abb", async () => {
    // Tx: https://hyperevmscan.io/tx/0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb
    const txHash =
      "0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    // Stub the periphery address for this test
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const repo = dataSource.getRepository(entities.ArbitraryActionsExecuted);
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0x900ae297e854a869531be43d57f0da808207132313de1a986558eefcac41a89c",
      initialToken: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
      initialAmount: 100003, // String for bigint/numeric
      finalToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      finalAmount: 100003,
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);

  it("should ingest the FilledRelay event from Arbitrum tx 0xc9f5...fedd", async () => {
    // Tx: https://arbiscan.io/tx/0xc9f5e1df9cfc9796093bfb550c7c5bde3e435578bc24aebc7ed30703b0befedd
    const txHash =
      "0xc9f5e1df9cfc9796093bfb550c7c5bde3e435578bc24aebc7ed30703b0befedd";
    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );
    // Stub getDeployedAddress
    sinon
      .stub(contractUtils, "getAddress")
      .returns("0xe35e9842fceaca96570b734083f4a58e8f7c5f2a");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [SPOKE_POOL_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(
      SPOKE_POOL_PROTOCOL.getEventHandlers(logger, CHAIN_IDs.ARBITRUM).length,
    );
    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const repo = dataSource.getRepository(entities.FilledV3Relay);
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 2,
      logIndex: 4,
      finalised: false,
      depositId: 5287817,
      originChainId: 8453,
      destinationChainId: CHAIN_IDs.ARBITRUM,
      inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      outputToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
      inputAmount: "1009060",
      outputAmount: "1000000",
      fillDeadline: new Date(1767985475 * 1000),
      exclusivityDeadline: new Date(1767978416 * 1000),
      exclusiveRelayer: "0xeF1eC136931Ab5728B0783FD87D109c9D15D31F1",
      depositor: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      recipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      message:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      relayer: "0xeF1eC136931Ab5728B0783FD87D109c9D15D31F1",
      repaymentChainId: 8453,
      updatedRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      updatedMessage:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      updatedOutputAmount: "1000000",
      fillType: 0,
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);

  it("should ingest the FallbackHyperEVMFlowCompleted event from HyperEVM tx 0xb940...2d02", async () => {
    // Tx: https://hyperevmscan.io/tx/0xb940059314450f7f7cb92972182cdf3f5fb5f54aab27c28b7426a78e6fb32d02
    const txHash =
      "0xb940059314450f7f7cb92972182cdf3f5fb5f54aab27c28b7426a78e6fb32d02";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    // Stub the periphery address for this test
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const repo = dataSource.getRepository(
      entities.FallbackHyperEVMFlowCompleted,
    );
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0xd4731c4ab33b3a364d599940d9ba46df41f6a75233a361e2d312e072540ed184",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
      evmAmountIn: 999900,
      bridgingFeesIncurred: 100,
      evmAmountSponsored: 0,
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);

  it("should ingest the SponsoredAccountActivation event from HyperEVM tx 0x4afd...230a", async () => {
    // Tx: https://hyperevmscan.io/tx/0x4afdb0310d407241b875c1fe00fbfd40e311e665b8456c65d8fcb3ba9083230a
    const txHash =
      "0x4afdb0310d407241b875c1fe00fbfd40e311e665b8456c65d8fcb3ba9083230a";
    const hyperClient = getTestPublicClient(CHAIN_IDs.HYPEREVM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      hyperClient,
      txHash,
    );

    // Stub the periphery address for this test
    sinon
      .stub(contractUtils, "getSponsoredCCTPDstPeripheryAddress")
      .returns("0x7B164050BBC8e7ef3253e7db0D74b713Ba3F1c95");

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl: rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.HYPEREVM,
      protocols: [SPONSORED_CCTP_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const repo = dataSource.getRepository(entities.SponsoredAccountActivation);
    const savedEvent = await repo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      blockNumber: Number(block.number),
      chainId: CHAIN_IDs.HYPEREVM,
      transactionHash: txHash,
      quoteNonce:
        "0xd4731c4ab33b3a364d599940d9ba46df41f6a75233a361e2d312e072540ed184",
      finalRecipient: "0x63aAeEb87f4d5ac9eb95EeF0edDc0D6E7f71800d",
      fundingToken: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
      evmAmountSponsored: 1000000,
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);

  it("should ingest the OFTSent event from Arbitrum tx 0x98f7...f3e5", async () => {
    const txHash =
      "0x98f730345b717d94926e9916fa748e6a5e3a3db150b213ca7cd5d9c2045df3e5";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer with OFT protocol
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [OFT_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const oftSentRepo = dataSource.getRepository(entities.OFTSent);
    const savedEvent = await oftSentRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      // --- Chain Context ---
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      finalised: false, // Should be false initially for WS events
      // --- OFT Event Data ---
      guid: "0x7fbbbfb502d445fe2b05abc6567a14c804a8d140b098f8a4a2e13ac71ce98605",
      fromAddress: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      dstEid: 30109, // Polygon endpoint
      amountSentLD: 1000000,
      amountReceivedLD: 1000000,
      token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // Arbitrum USDT
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
    expect(savedEvent!.deletedAt).to.be.null;
    expect(savedEvent!.dataSource).to.equal(DataSourceType.WEB_SOCKET);
  }).timeout(20000);

  it("should ingest the OFTReceived event from Arbitrum tx 0x470d...7e71", async () => {
    const txHash =
      "0x470dcf88ce88e105f27964992827214c2ce36112c2e92f2a377fb57a68557e71";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer with OFT protocol
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [OFT_PROTOCOL],
      transportOptions: { reconnect: false, timeout: 30_000 },
    });

    await server.waitForSubscription(2);

    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const oftReceivedRepo = dataSource.getRepository(entities.OFTReceived);
    const savedEvent = await oftReceivedRepo.findOne({
      where: { transactionHash: txHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      // --- Chain Context ---
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      finalised: false, // Should be false initially for WS events
      // --- OFT Event Data ---
      guid: "0x973335284a0b34364ced135d8b7e0da909f827acf99654d13e6de97b0d726df5",
      srcEid: 30101, // Ethereum mainnet endpoint
      toAddress: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
      amountReceivedLD: 824495616,
      token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // Arbitrum USDT
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
    expect(savedEvent!.deletedAt).to.be.null;
    expect(savedEvent!.dataSource).to.equal(DataSourceType.WEB_SOCKET);
  }).timeout(20000);
});
