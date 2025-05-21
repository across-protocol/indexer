import { RequestedV3SlowFill } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class RequestedSlowFillFixture {
  private repository: Repository<RequestedV3SlowFill>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(RequestedV3SlowFill);
  }

  /**
   * Creates a mock RequestedV3SlowFill object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock RequestedV3SlowFill object
   */
  public mockRequestedSlowFill(overrides: Partial<RequestedV3SlowFill>) {
    return {
      relayHash: "0xaaa",
      internalHash: "0xaaa",
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
   * Inserts one or more requestedSlowFills into the database. If no requestedSlowFills are provided,
   * a single mock requestedSlowFill with default values will be inserted.
   * @param requestedSlowFills - Array of partial RequestedV3SlowFill objects to insert
   * @returns Promise containing the result of the insert operation
   */
  public async insertRequestedSlowFills(
    requestedSlowFills: Partial<RequestedV3SlowFill>[],
  ): Promise<[RequestedV3SlowFill, ...RequestedV3SlowFill[]]> {
    if (requestedSlowFills.length === 0) {
      requestedSlowFills.push(this.mockRequestedSlowFill({}));
    }
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(
        requestedSlowFills.map((requestedSlowFill) =>
          this.mockRequestedSlowFill(requestedSlowFill),
        ),
      )
      .returning("*")
      .execute();

    return result.generatedMaps as [
      RequestedV3SlowFill,
      ...RequestedV3SlowFill[],
    ];
  }

  /**
   * Deletes all requestedSlowFills from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllRequestedSlowFills(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."requested_v3_slow_fill" restart identity cascade`,
    );
  }
}
