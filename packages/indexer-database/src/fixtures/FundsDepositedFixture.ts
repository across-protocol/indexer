import { V3FundsDeposited } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, InsertResult, Repository } from "typeorm";

export class FundsDepositedFixture {
  private repository: Repository<V3FundsDeposited>;
  public constructor(private dataSource: DataSource) {
    this.setRepository();
  }

  private setRepository() {
    this.repository = this.dataSource.getRepository(V3FundsDeposited);
  }

  /**
   * Creates a mock V3FundsDeposited object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock V3FundsDeposited object
   */
  public mockFundsDeposited(overrides: Partial<V3FundsDeposited>) {
    return {
      relayHash: "0xaaa",
      depositId: getRandomInt().toString(),
      originChainId: 1,
      destinationChainId: 10,
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
      internalHash: "0xaaa",
      exclusiveRelayer: "0x",
      exclusivityDeadline: new Date(),
      fillDeadline: new Date(),
      quoteTimestamp: new Date(),
      transactionHash: "0x",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1,
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
  public insertDeposits(
    deposits: Partial<V3FundsDeposited>[],
  ): Promise<InsertResult> {
    if (deposits.length === 0) {
      deposits.push(this.mockFundsDeposited({}));
    }
    return this.repository.insert(
      deposits.map((deposit) => this.mockFundsDeposited(deposit)),
    );
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
