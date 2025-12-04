import { expect } from "chai";
import { DataSource } from "typeorm";
import { getTestDataSource } from "../../tests/setup";
import { startArbitrumIndexing } from "../service/indexing";
import { MockWebSocketRPCServer } from "../../tests/testProvider";
import { utils as dbUtils } from "@repo/indexer-database";
import { entities } from "@repo/indexer-database";
import {
  TOKEN_MESSENGER_ADDRESS_MAINNET,
  MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
} from "../service/constants";
import sinon from "sinon";
import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";

describe("Indexer Integration (Real Transaction Data)", () => {
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
      error: sinon.spy(),
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
  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    abortController.abort();
    server.stop();
    sinon.restore();
  });

  /**
   * Tests ingesting a DepositForBurn event from a specific Arbitrum Sepolia transaction.
   */
  it("should ingest the DepositForBurn event from Arbitrum tx 0xabb...69f7", async () => {
    // Real Transaction Data taken from:
    // https://arbiscan.io/tx/0xf38daaf5d34c3363cd8843c47643ca9583fc04a17f8a93d153e7549ad3509cc0#eventlog
    const txHash =
      "0xf38daaf5d34c3363cd8843c47643ca9583fc04a17f8a93d153e7549ad3509cc0";
    const blockNumber = 404646713;
    const blockHash =
      "0x342ccc908658d25d7693bfca44fcb3caf3d46f808608043fbb1aa5195c05d43a";
    // Prime the Mock Server
    // When the indexer asks for the block details, return this mocked response
    server.mockBlockResponse({
      number: "0x" + blockNumber.toString(16),
      hash: blockHash,
      timestamp: "0x6564b1f3",
      transactions: [],
    });

    // Start the Indexer with the real repository
    startArbitrumIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
    });
    await server.waitForSubscription();

    // Push the REAL Event Payload
    // This matches Log Index 5 from the transaction logs on Arbiscan
    server.pushEvent({
      address: TOKEN_MESSENGER_ADDRESS_MAINNET,
      blockNumber: "0x" + blockNumber.toString(16),
      transactionHash: txHash,
      logIndex: "0x5",
      blockHash,
      transactionIndex: "0x1", // Position of tx in the block
      // Topics directly from the Arbiscan Event Logs tab
      topics: [
        // Topic 0: Event Signature
        "0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5",
        // Topic 1: burnToken (0xaf88...5831)
        "0x000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831",
        // Topic 2: depositor (0x085B...c9a7)
        "0x000000000000000000000000085b48ca6908dceafb4fae56c90709e1537ec9a7",
        // Topic 3: minFinalityThreshold (1000 -> 0x3e8)
        "0x00000000000000000000000000000000000000000000000000000000000003e8",
      ],

      // Non-indexed data (concatenated 32-byte words) copied from Arbiscan Data field
      data:
        "0x" +
        // amount: 13651272820 -> 0x32DC4E474
        "000000000000000000000000000000000000000000000000000000032DC4E474" +
        // mintRecipient
        "000000000000000000000000047669EBB4EC165D2BD5E78706E9AEDE04BF095A" +
        // destinationDomain: 0
        "0000000000000000000000000000000000000000000000000000000000000000" +
        // destinationTokenMessenger
        "00000000000000000000000028B5A0E9C621A5BADAA536219B3A228C8168CF5D" +
        // destinationCaller
        "000000000000000000000000047669EBB4EC165D2BD5E78706E9AEDE04BF095A" +
        // maxFee: 1365128 -> 0x14D488
        "000000000000000000000000000000000000000000000000000000000014D488" +
        // hookData offset (pointer to where bytes start): 224 (0xe0)
        "00000000000000000000000000000000000000000000000000000000000000e0" +
        // hookData length: 544 bytes (0x220) based on the hex from the test
        "0000000000000000000000000000000000000000000000000000000000000220" +
        // The hookData Blob
        "0000000000000000000000000000000000000000000000000000000000000080" +
        "00000000000000000000000000000000000000000000000000000000000001E0" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "000000000000000000000000000000000000000000000000000000000000000A" +
        "0000000000000000000000000C9B4D255736E4936F55C0BF2A6B32D5773808CC" +
        "00000000000000000000000012B9C482289560089E03CAD1D263EA6D94582CAD" +
        "00000000000000000000000017658341D07039E1E960D7717ABEA24624745235" +
        "0000000000000000000000003059D274AFA5B7E6E62C55BEB305E0D321F8AE03" +
        "00000000000000000000000034C727BC1BEA6EEF54158601F570A9464CA5D387" +
        "0000000000000000000000004DAAD69DD6F39C0B0FAB5E6304B863D55A05A83B" +
        "00000000000000000000000057DAA33E7783C773E0250A1DE7E33F413A18B3E5" +
        "00000000000000000000000094256AE37597541DB993EAFC4FF063B3ACC76E96" +
        "0000000000000000000000009D8D38C6C84EDC80C743C5D843E23EDF3B1793BE" +
        "000000000000000000000000BF81FB11A7B0D3333A05E767A022669FAC656C17" +
        "000000000000000000000000000000000000000000000000000000000000000A" +
        "000000000000000000000000000000000000000000000000000000000F7A5710" +
        "0000000000000000000000000000000000000000000000000000000002E9FA73" +
        "000000000000000000000000000000000000000000000000000000000C7AB6AE" +
        "0000000000000000000000000000000000000000000000000000000000DE1043" +
        "0000000000000000000000000000000000000000000000000000000000F3978A" +
        "0000000000000000000000000000000000000000000000000000000000F48BC1" +
        "00000000000000000000000000000000000000000000000000000000082A7440" +
        "0000000000000000000000000000000000000000000000000000000000208502" +
        "F00000000000000000000000000000000000000000000000000000000011BFD9" +
        "5000000000000000000000000000000000000000000000000000000002540BE4" +
        "1E",
    });

    // Wait for the async event loop to process the message
    await new Promise((r) => setTimeout(r, 500));

    // Verify Persistence by querying the real in-memory database
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });

    // Basic Existence Check
    expect(savedEvent).to.exist;

    // Detailed Field Verification
    // We use 'deep.include' to check the subset of properties we care about
    // (ignoring auto-generated fields like 'createdAt', 'id', etc. if needed,
    // though here we check specific logic-driven fields)
    expect(savedEvent).to.deep.include({
      // --- Chain Context ---
      chainId: CHAIN_IDs.ARBITRUM, // Arbitrum One
      blockNumber,
      transactionHash: txHash,
      transactionIndex: 1,
      logIndex: 5,
      finalised: false, // Should be false initially for WS events

      // --- CCTP Event Data ---
      burnToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC

      // Note: TypeORM might return BigInts as strings or numbers depending on config.
      // Adjust strictly based on your entity definition. Usually string for big numbers.
      amount: 13652780148, // 136.52 USDC
      maxFee: 1365128, // 0.013 USDC

      depositor: "0x085B48Ca6908DceAFb4FaE56C90709E1537Ec9a7",
      mintRecipient: "0x047669eBB4EC165d2Bd5E78706E9aede04BF095a",

      destinationDomain: 0,
      destinationTokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      destinationCaller: "0x047669eBB4EC165d2Bd5E78706E9aede04BF095a",

      minFinalityThreshold: 1000,

      // We verify the hookData matches exactly
      hookData:
        "0x000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000c9b4d255736e4936f55c0bf2a6b32d5773808cc00000000000000000000000012b9c482289560089e03cad1d263ea6d94582cad00000000000000000000000017658341d07039e1e960d7717abea246247452350000000000000000000000003059d274afa5b7e6e62c55beb305e0d321f8ae0300000000000000000000000034c727bc1bea6eef54158601f570a9464ca5d3870000000000000000000000004daad69dd6f39c0b0fab5e6304b863d55a05a83b00000000000000000000000057daa33e7783c773e0250a1de7e33f413a18b3e500000000000000000000000094256ae37597541db993eafc4ff063b3acc76e960000000000000000000000009d8d38c6c84edc80c743c5d843e23edf3b1793be000000000000000000000000bf81fb11a7b0d3333a05e767a022669fac656c17000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000f7a5710",
    });

    // Date verification (Dates in JS are objects, strict equality fails, so check separately)
    // 2023-11-27T15:12:51.000Z
    expect(savedEvent!.blockTimestamp.toISOString()).to.equal(
      "2023-11-27T15:12:51.000Z",
    );

    // Null checks
    expect(savedEvent!.deletedAt).to.be.null;
    expect(savedEvent!.finalizerJob).to.be.undefined;
  }).timeout(20000);

  it("should ingest the MessageSent event from Arbitrum Sepolia tx 0x1c21...d0b", async () => {
    // Real Transaction Data taken from:
    // https://sepolia.arbiscan.io/tx/0x1c21e4117c98efb94600d42d7500aaf221d7614ff3a06a3e5f6fb7d605a27d0b#eventlog#5
    const txHash =
      "0x1c21e4117c98efb94600d42d7500aaf221d7614ff3a06a3e5f6fb7d605a27d0b";
    const blockNumber = 214159659;
    const blockHash =
      "0x72f5543d9977ff6e94e7886b9d406f65683bd7ddf6339c7dbfd11afc54140da8";
    const blockTimestamp = "0x64d73b03"; // Aug-12-2023 09:00:35 AM +UTC

    // Prime the Mock Server
    server.mockBlockResponse({
      number: "0x" + blockNumber.toString(16),
      hash: blockHash,
      timestamp: blockTimestamp,
      transactions: [],
    });

    // Start the Indexer with the real repository
    // Since `startArbitrumIndexer` is now configured to listen for both
    // DepositForBurn and MessageSent, we can call it directly.
    startArbitrumIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      testNet: true,
    });
    await server.waitForSubscription();

    const messageData =
      "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000029800000001000000030000001300000000000000000000000000000000000000000000000000000000000000000000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000000000000000000000000000000000000000000000000003e8000000000000000100000000000000000000000075faf114eafb1bdbe2f0316df893fd58ce46aa4d00000000000000000000000006c61d54958a0772ee8af41789466d39ffeaeb1300000000000000000000000000000000000000000000000000000000000f424000000000000000000000000079176e2e91c77b57ac11c6fe2d2ab2203d87af850000000000000000000000000000000000000000000000000000000000030da400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a5b39782b400ba6061ffd38c4c46abb157925d12dafb3b3d71ec94c8807e835b0000000000000000000000000000000000000000000000000000000069135cbc00000000000000000000000000000000000000000000000000000000000007d200000000000000000000000000000000000000000000000000000000000000640000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000111111a1a0667d36bd57c0a9f569b980571111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    // Push the REAL Event Payload
    // This matches Log Index 32 from the transaction logs on Arbiscan
    server.pushEvent({
      address: MESSAGE_TRANSMITTER_ADDRESS_TESTNET,
      blockNumber: "0x" + blockNumber.toString(16),
      transactionHash: txHash,
      logIndex: "0x20", // 32
      blockHash,
      transactionIndex: "0x1", // From original test, position in block
      topics: [
        // Topic 0: Event Signature MessageSent(bytes message)
        "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036",
      ],
      data: messageData,
    });

    // Wait for the async event loop to process the message
    await new Promise((r) => setTimeout(r, 500));

    // Verify Persistence by querying the real in-memory database
    const messageSentRepo = dataSource.getRepository(entities.MessageSent);
    const savedEvent = await messageSentRepo.findOne({
      where: { transactionHash: txHash, logIndex: 32 },
    });

    // Basic Existence Check
    expect(savedEvent).to.exist;
    // Detailed Field Verification
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM_SEPOLIA,
      blockNumber: blockNumber,
      transactionHash: txHash,
      transactionIndex: 1,
      logIndex: 32,
      finalised: false,
      version: 1,
      sourceDomain: 3,
      destinationDomain: 19,
      message:
        "0x00000001000000030000001300000000000000000000000000000000000000000000000000000000000000000000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000008fe6b999dc680ccfdd5bf7eb0974218be2542daa0000000000000000000000000000000000000000000000000000000000000000000003e8000000000000000100000000000000000000000075faf114eafb1bdbe2f0316df893fd58ce46aa4d00000000000000000000000006c61d54958a0772ee8af41789466d39ffeaeb1300000000000000000000000000000000000000000000000000000000000f424000000000000000000000000079176e2e91c77b57ac11c6fe2d2ab2203d87af850000000000000000000000000000000000000000000000000000000000030da400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a5b39782b400ba6061ffd38c4c46abb157925d12dafb3b3d71ec94c8807e835b0000000000000000000000000000000000000000000000000000000069135cbc00000000000000000000000000000000000000000000000000000000000007d200000000000000000000000000000000000000000000000000000000000000640000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000111111a1a0667d36bd57c0a9f569b98057111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      sender: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
      recipient: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
      destinationCaller: "0x0000000000000000000000000000000000000000",
      minFinalityThreshold: 1000,
      finalityThresholdExecuted: 0,
      messageBody:
        "0x0000000100000000000000000000000075faf114eafb1bdbe2f0316df893fd58ce46aa4d00000000000000000000000006c61d54958a0772ee8af41789466d39ffeaeb1300000000000000000000000000000000000000000000000000000000000f424000000000000000000000000079176e2e91c77b57ac11c6fe2d2ab2203d87af850000000000000000000000000000000000000000000000000000000000030da400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a5b39782b400ba6061ffd38c4c46abb157925d12dafb3b3d71ec94c8807e835b0000000000000000000000000000000000000000000000000000000069135cbc00000000000000000000000000000000000000000000000000000000000007d200000000000000000000000000000000000000000000000000000000000000640000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000111111a1a0667d36bd57c0a9f569b98057111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    });

    // Date verification
    expect(savedEvent!.blockTimestamp.toISOString()).to.equal(
      "2023-08-12T07:55:47.000Z",
    );

    // Null checks
    expect(savedEvent!.deletedAt).to.be.null;
  }).timeout(20000);
});
