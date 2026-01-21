import { expect } from "chai";
import { ethers } from "ethers";
import winston from "winston";

import { DataSource } from "@repo/indexer-database";

import { SwapMetadataRepository } from "../database/SwapMetadataRepository";

describe("SwapMetadataRepository Tests", () => {
  let swapMetadataRepository: SwapMetadataRepository;
  let mockDataSource: DataSource;
  let logger: winston.Logger;

  before(() => {
    logger = winston.createLogger({
      transports: [new winston.transports.Console()],
    });

    // Mock DataSource - not used in this unit test
    mockDataSource = {} as DataSource;
    swapMetadataRepository = new SwapMetadataRepository(mockDataSource, logger);
  });

  it("should instantiate SwapMetadataRepository correctly", () => {
    expect(swapMetadataRepository).to.be.instanceOf(SwapMetadataRepository);
  });

  it("decodes encoded swap metadata bytes correctly", () => {
    const abiCoder = ethers.utils.defaultAbiCoder;

    const version = 1; // uint8
    const typeVal = 1; // uint8 (destination)
    const side = 1; // uint8 (sell/output)
    const address = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607"; // address
    const maximumAmountIn = ethers.BigNumber.from("100000"); // uint256
    const minAmountOut = ethers.BigNumber.from("95000"); // uint256
    const expectedAmountOut = ethers.BigNumber.from("98000"); // uint256
    const expectedAmountIn = ethers.BigNumber.from("100000"); // uint256
    const swapProvider = "UniswapV3"; // string
    const slippageBps = ethers.BigNumber.from("200"); // uint256 (2%)
    const autoSlippage = false; // bool
    const recipient = "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D"; // address
    const appFeeRecipient = ethers.constants.AddressZero; // address -> should decode to null

    const encoded = abiCoder.encode(
      [
        "uint8",
        "uint8",
        "uint8",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "string",
        "uint256",
        "bool",
        "address",
        "address",
      ],
      [
        version,
        typeVal,
        side,
        address,
        maximumAmountIn,
        minAmountOut,
        expectedAmountOut,
        expectedAmountIn,
        swapProvider,
        slippageBps,
        autoSlippage,
        recipient,
        appFeeRecipient,
      ],
    );

    const decoded = (swapMetadataRepository as any).decodeSwapMetadata(encoded);

    expect(decoded.version).to.equal(version);
    expect(decoded.type).to.equal(typeVal);
    expect(decoded.side).to.equal(side);
    expect(decoded.address).to.equal(address);
    expect(decoded.maximumAmountIn.toString()).to.equal("100000");
    expect(decoded.minAmountOut.toString()).to.equal("95000");
    expect(decoded.expectedAmountOut.toString()).to.equal("98000");
    expect(decoded.expectedAmountIn.toString()).to.equal("100000");
    expect(decoded.swapProvider).to.equal("UniswapV3");
    expect(decoded.slippage.toString()).to.equal("200");
    expect(decoded.autoSlippage).to.equal(false);
    expect(decoded.recipient).to.equal(recipient);
    expect(decoded.appFeeRecipient).to.equal(null);
  });
});
