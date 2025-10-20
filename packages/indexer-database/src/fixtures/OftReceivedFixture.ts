import { DataSource, DeleteResult, Repository } from "typeorm";
import { utils } from "@across-protocol/sdk";
import { OFTReceived } from "../entities";
import {
  getMockedEvmTransactionHash,
  getRandomInt,
} from "../utils/FixtureUtils";

export class OftReceivedFixture {
  private repository: Repository<OFTReceived>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(OFTReceived);
  }

  /**
   * Creates a mock OFTReceived object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock OFTReceived object
   */
  public mockOftReceived(overrides: Partial<OFTReceived>) {
    return {
      guid: utils.randomAddress(),
      srcEid: 30101, // Default source endpoint ID (e.g., Arbitrum)
      toAddress: utils.randomAddress(),
      amountReceivedLD: "990000",
      token: utils.randomAddress(),
      chainId: "10",
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
   * Inserts one or more OFTReceived events into the database. If no events are provided,
   * a single mock event with default values will be inserted.
   * @param oftReceivedEvents - Array of partial OFTReceived objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const oftReceivedFixture = new OftReceivedFixture(dataSource);
   * const oftReceivedEvent = oftReceivedFixture.mockOftReceived({ guid: "override with custom guid" });
   * const savedOftReceivedEvent = await oftReceivedFixture.insertOftReceivedEvents([oftReceivedEvent]);
   */
  public async insertOftReceivedEvents(
    oftReceivedEvents: Partial<OFTReceived>[] = [this.mockOftReceived({})],
  ): Promise<OFTReceived[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(oftReceivedEvents.map((event) => this.mockOftReceived(event)))
      .returning("*")
      .execute();

    return result.generatedMaps as [OFTReceived];
  }

  /**
   * Deletes all OFTReceived events from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const oftReceivedFixture = new OftReceivedFixture(dataSource);
   * await oftReceivedFixture.deleteAllOftReceivedEvents();
   */
  public deleteAllOftReceivedEvents(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."oft_received" restart identity cascade`,
    );
  }
}
