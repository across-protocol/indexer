import { DataSource, DeleteResult, Repository } from "typeorm";
import { utils } from "@across-protocol/sdk";
import { ethers } from "ethers";

import { MessageSent } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";

export class MessageSentFixture {
  private repository: Repository<MessageSent>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(MessageSent);
  }

  /**
   * Creates a mock MessageSent object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock MessageSent object
   */
  public mockMessageSent(overrides: Partial<MessageSent>) {
    return {
      message: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      version: 0,
      sourceDomain: 1,
      destinationDomain: 2,
      nonce: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      sender: utils.randomAddress(),
      recipient: utils.randomAddress(),
      destinationCaller: utils.randomAddress(),
      minFinalityThreshold: 1000,
      finalityThresholdExecuted: 1000,
      messageBody: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      chainId: "1",
      blockHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      blockNumber: getRandomInt(1000000, 20000000),
      transactionHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      transactionIndex: getRandomInt(0, 100),
      logIndex: getRandomInt(0, 200),
      finalised: true,
      blockTimestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Inserts one or more MessageSent events into the database. If no events are provided,
   * a single mock event with default values will be inserted.
   * @param messageSentEvents - Array of partial MessageSent objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const messageSentFixture = new MessageSentFixture(dataSource);
   * const messageSentEvent = messageSentFixture.mockMessageSent({ message: "override with custom message" });
   * const savedMessageSentEvent = await messageSentFixture.insertMessageSentEvents([messageSentEvent]);
   */
  public async insertMessageSentEvents(
    messageSentEvents: Partial<MessageSent>[] = [this.mockMessageSent({})],
  ): Promise<MessageSent[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(messageSentEvents.map((event) => this.mockMessageSent(event)))
      .returning("*")
      .execute();

    return result.generatedMaps as [MessageSent];
  }

  /**
   * Deletes all MessageSent events from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const messageSentFixture = new MessageSentFixture(dataSource);
   * await messageSentFixture.deleteAllMessageSentEvents();
   */
  public deleteAllMessageSentEvents(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."message_sent" restart identity cascade`,
    );
  }
}
