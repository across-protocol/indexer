import { DataSource, DeleteResult, Repository } from "typeorm";
import { utils } from "@across-protocol/sdk";
import { ethers } from "ethers";

import { MessageReceived } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";

export class MessageReceivedFixture {
  private repository: Repository<MessageReceived>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(MessageReceived);
  }

  /**
   * Creates a mock MessageReceived object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock MessageReceived object
   */
  public mockMessageReceived(overrides: Partial<MessageReceived>) {
    return {
      caller: utils.randomAddress(),
      sourceDomain: 1,
      nonce: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      sender: utils.randomAddress(),
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
   * Inserts one or more MessageReceived events into the database. If no events are provided,
   * a single mock event with default values will be inserted.
   * @param messageReceivedEvents - Array of partial MessageReceived objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const messageReceivedFixture = new MessageReceivedFixture(dataSource);
   * const messageReceivedEvent = messageReceivedFixture.mockMessageReceived({ message: "override with custom message" });
   * const savedMessageReceivedEvent = await messageReceivedFixture.insertMessageReceivedEvents([messageReceivedEvent]);
   */
  public async insertMessageReceivedEvents(
    messageReceivedEvents: Partial<MessageReceived>[] = [
      this.mockMessageReceived({}),
    ],
  ): Promise<MessageReceived[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(
        messageReceivedEvents.map((event) => this.mockMessageReceived(event)),
      )
      .returning("*")
      .execute();

    return result.generatedMaps as [MessageReceived];
  }

  /**
   * Deletes all MessageReceived events from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const messageReceivedFixture = new MessageReceivedFixture(dataSource);
   * await messageReceivedFixture.deleteAllMessageReceivedEvents();
   */
  public deleteAllMessageReceivedEvents(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."message_received" restart identity cascade`,
    );
  }
}
