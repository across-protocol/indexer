import { V3FundsDeposited } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";
import { ethers } from "ethers";

export class FundsDepositedFixture {
  private repository: Repository<V3FundsDeposited>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(V3FundsDeposited);
  }

  /**
   * Creates a mock V3FundsDeposited object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock V3FundsDeposited object
   */
  public mockFundsDeposited(overrides: Partial<V3FundsDeposited>) {
    return {
      relayHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      internalHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      depositId: getRandomInt().toString(),
      originChainId: "1",
      destinationChainId: "10",
      fromLiteChain: false,
      toLiteChain: false,
      depositor: "0x",
      recipient: "0x",
      inputToken: "0x",
      inputAmount: "10",
      outputToken: "0x",
      outputAmount: "9",
      message: "0x",
      messageHash: "0x",
      exclusiveRelayer: "0x",
      exclusivityDeadline: new Date(),
      fillDeadline: new Date(),
      quoteTimestamp: new Date(),
      transactionHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      transactionIndex: getRandomInt(0, 100),
      logIndex: getRandomInt(0, 200),
      blockNumber: getRandomInt(0, 20000000),
      finalised: true,
      blockTimestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Inserts one or more deposits into the database. If no deposits are provided,
   * a single mock deposit with default values will be inserted.
   * @param deposits - Array of partial V3FundsDeposited objects to insert
   * @returns Promise containing the result of the insert operation
   */
  public async insertDeposits(
    deposits: Partial<V3FundsDeposited>[],
  ): Promise<[V3FundsDeposited, ...V3FundsDeposited[]]> {
    if (deposits.length === 0) {
      deposits.push(this.mockFundsDeposited({}));
    }
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(deposits.map((deposit) => this.mockFundsDeposited(deposit)))
      .returning("*")
      .execute();

    return result.generatedMaps as [V3FundsDeposited, ...V3FundsDeposited[]];
  }

  /**
   * Deletes all deposits from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllDeposits(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."v3_funds_deposited" restart identity cascade`,
    );
  }
}
