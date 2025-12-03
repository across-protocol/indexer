import { DataSource, DeleteResult, Repository } from "typeorm";
import { utils } from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";
import { ethers } from "ethers";

import { DepositForBurn } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";

export class DepositForBurnFixture {
  private repository: Repository<DepositForBurn>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(DepositForBurn);
  }

  /**
   * Creates a mock DepositForBurn object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock DepositForBurn object
   */
  public mockDepositForBurn(overrides: Partial<DepositForBurn>) {
    return {
      burnToken: utils.randomAddress(),
      amount: "1000000",
      depositor: utils.randomAddress(),
      mintRecipient: utils.randomAddress(),
      destinationDomain: 6,
      destinationTokenMessenger: utils.randomAddress(),
      destinationCaller: utils.randomAddress(),
      maxFee: "1000",
      minFinalityThreshold: 1000,
      hookData: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      chainId: CHAIN_IDs.ARBITRUM.toString(),
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
   * Inserts one or more DepositForBurn events into the database. If no events are provided,
   * a single mock event with default values will be inserted.
   * @param depositForBurnEvents - Array of partial DepositForBurn objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const depositForBurnFixture = new DepositForBurnFixture(dataSource);
   * const depositForBurnEvent = depositForBurnFixture.mockDepositForBurn({ burnToken: "override with custom token" });
   * const savedDepositForBurnEvent = await depositForBurnFixture.insertDepositForBurnEvents([depositForBurnEvent]);
   */
  public async insertDepositForBurnEvents(
    depositForBurnEvents: Partial<DepositForBurn>[] = [
      this.mockDepositForBurn({}),
    ],
  ): Promise<DepositForBurn[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(
        depositForBurnEvents.map((event) => this.mockDepositForBurn(event)),
      )
      .returning("*")
      .execute();

    return result.generatedMaps as [DepositForBurn];
  }

  /**
   * Deletes all DepositForBurn events from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const depositForBurnFixture = new DepositForBurnFixture(dataSource);
   * await depositForBurnFixture.deleteAllDepositForBurnEvents();
   */
  public deleteAllDepositForBurnEvents(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "evm"."deposit_for_burn" restart identity cascade`,
    );
  }
}
