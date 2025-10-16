import { OFTSent } from "../entities";
import {
  getMockedEvmAddress,
  getMockedEvmTransactionHash,
  getRandomInt,
} from "../utils/FixtureUtils";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class OftSentFixture {
  private repository: Repository<OFTSent>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(OFTSent);
  }

  /**
   * Creates a mock OFTSent object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock OFTSent object
   */
  public mockOftSent(overrides: Partial<OFTSent>) {
    return {
      guid: getMockedEvmAddress(),
      dstEid: 30101, // Default destination endpoint ID (e.g., Arbitrum)
      fromAddress: getMockedEvmAddress(),
      amountSentLD: "1000000",
      amountReceivedLD: "990000",
      token: getMockedEvmAddress(),
      chainId: "1",
      blockHash: getMockedEvmTransactionHash(),
      blockNumber: getRandomInt(1000000, 20000000),
      transactionHash: getMockedEvmTransactionHash(),
      transactionIndex: getRandomInt(0, 100),
      logIndex: getRandomInt(0, 200),
      finalised: true,
      blockTimestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Inserts one or more OFTSent events into the database. If no events are provided,
   * a single mock event with default values will be inserted.
   * @param oftSentEvents - Array of partial OFTSent objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const oftSentFixture = new OftSentFixture(dataSource);
   * const oftSentEvent = oftSentFixture.mockOftSent({ guid: "override with custom guid" });
   * const savedOftSentEvent = await oftSentFixture.insertOftSentEvents([oftSentEvent]);
   */
  public async insertOftSentEvents(
    oftSentEvents: Partial<OFTSent>[] = [this.mockOftSent({})],
  ): Promise<OFTSent[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(oftSentEvents.map((event) => this.mockOftSent(event)))
      .returning("*")
      .execute();

    return result.generatedMaps as [OFTSent];
  }

  /**
   * Deletes all OFTSent events from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const oftSentFixture = new OftSentFixture(dataSource);
   * await oftSentFixture.deleteAllOftSentEvents();
   */
  public deleteAllOftSentEvents(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."oft_sent" restart identity cascade`,
    );
  }
}
