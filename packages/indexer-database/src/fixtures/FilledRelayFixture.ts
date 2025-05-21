import { interfaces } from "@across-protocol/sdk";
import { FilledV3Relay } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class FilledRelayFixture {
  private repository: Repository<FilledV3Relay>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(FilledV3Relay);
  }

  /**
   * Creates a mock FilledV3Relay object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock FilledV3Relay object
   */
  public mockFilledRelay(overrides: Partial<FilledV3Relay>) {
    return {
      relayHash: "0xaaa",
      internalHash: "0xaaa",
      depositId: getRandomInt().toString(),
      originChainId: "1",
      destinationChainId: "10",
      depositor: "0x",
      recipient: "0x",
      inputToken: "0x",
      inputAmount: "10",
      outputToken: "0x",
      outputAmount: "9",
      message: "0x",
      exclusiveRelayer: "0x",
      exclusivityDeadline: new Date(),
      fillDeadline: new Date(),
      updatedRecipient: "0x",
      updatedMessage: "0x",
      updatedOutputAmount: "9",
      fillType: interfaces.FillType.FastFill,
      relayer: "0x",
      repaymentChainId: 1,
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
   * Inserts one or more fills into the database. If no fills are provided,
   * a single mock fill with default values will be inserted.
   * @param fills - Array of partial FilledV3Relay objects to insert
   * @returns Promise containing the result of the insert operation
   */
  public async insertFills(
    fills: Partial<FilledV3Relay>[],
  ): Promise<[FilledV3Relay, ...FilledV3Relay[]]> {
    if (fills.length === 0) {
      fills.push(this.mockFilledRelay({}));
    }
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(fills.map((fill) => this.mockFilledRelay(fill)))
      .returning("*")
      .execute();

    return result.generatedMaps as [FilledV3Relay, ...FilledV3Relay[]];
  }

  /**
   * Deletes all fills from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllFilledRelays(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."filled_v3_relay" restart identity cascade`,
    );
  }
}
