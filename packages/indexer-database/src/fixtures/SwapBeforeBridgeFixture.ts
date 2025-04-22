import { SwapBeforeBridge } from "../entities/evm/SwapBeforeBridge";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class SwapBeforeBridgeFixture {
  private repository: Repository<SwapBeforeBridge>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(SwapBeforeBridge);
  }

  /**
   * Creates a mock SwapBeforeBridge object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock SwapBeforeBridge object
   */
  public mockSwapBeforeBridge(overrides: Partial<SwapBeforeBridge>) {
    return {
      swapToken: "0x",
      acrossInputToken: "0x",
      acrossOutputToken: "0x",
      swapTokenAmount: "100",
      acrossInputAmount: "90",
      acrossOutputAmount: "85",
      exchange: "0x",
      blockHash: "0x",
      blockNumber: getRandomInt(),
      transactionHash: "0x",
      logIndex: getRandomInt(),
      chainId: 1,
      finalised: true,
      createdAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Inserts one or more swaps into the database. If no swaps are provided,
   * a single mock swap with default values will be inserted.
   * @param swaps - Array of partial SwapBeforeBridge objects to insert
   * @returns Promise containing the result of the insert operation
   */
  public async insertSwaps(
    swaps: Partial<SwapBeforeBridge>[],
  ): Promise<[SwapBeforeBridge, ...SwapBeforeBridge[]]> {
    if (swaps.length === 0) {
      swaps.push(this.mockSwapBeforeBridge({}));
    }
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(swaps.map((swap) => this.mockSwapBeforeBridge(swap)))
      .returning("*")
      .execute();

    return result.generatedMaps as [SwapBeforeBridge, ...SwapBeforeBridge[]];
  }

  /**
   * Deletes all swaps from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllSwaps(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."swap_before_bridge" restart identity cascade`,
    );
  }
}
