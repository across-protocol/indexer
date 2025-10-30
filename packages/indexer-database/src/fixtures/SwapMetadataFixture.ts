import { SwapMetadata } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class SwapMetadataFixture {
  private repository: Repository<SwapMetadata>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(SwapMetadata);
  }

  /**
   * Creates a mock SwapMetadata object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock SwapMetadata object
   */
  public mockSwapMetadata(
    overrides: Partial<SwapMetadata>,
  ): Partial<SwapMetadata> {
    return {
      version: "1",
      type: "0", // origin
      side: "0", // buy
      address: "0x1234567890123456789012345678901234567890",
      maximumAmountIn: "1000000000000000000",
      minAmountOut: "950000000000000000",
      expectedAmountOut: "980000000000000000",
      expectedAmountIn: "1000000000000000000",
      swapProvider: "UniswapV3",
      slippage: "500", // 5% in basis points
      autoSlippage: false,
      recipient: "0x9876543210987654321098765432109876543210",
      appFeeRecipient: undefined,
      blockHash: "0xblockhash",
      blockNumber: 1000,
      transactionHash: "0xtransactionhash",
      logIndex: 1,
      chainId: 1,
      finalised: true,
      createdAt: new Date(),
      blockTimestamp: new Date(),
      deletedAt: undefined,
      relayHashInfoId: undefined,
      ...overrides,
    };
  }

  /**
   * Inserts SwapMetadata records into the database.
   * @param swapMetadataData - Array of SwapMetadata data to insert
   * @returns Array of inserted SwapMetadata entities
   */
  public async insertSwapMetadata(
    swapMetadataData: Partial<SwapMetadata>[],
  ): Promise<SwapMetadata[]> {
    const swapMetadataEntities = swapMetadataData.map((data) => {
      const mockData = this.mockSwapMetadata(data);
      return this.repository.create(mockData);
    });

    return await this.repository.save(swapMetadataEntities);
  }

  /**
   * Deletes all SwapMetadata records from the database.
   * @returns DeleteResult
   */
  public async deleteAllSwapMetadata(): Promise<DeleteResult> {
    return await this.repository.delete({});
  }
}
