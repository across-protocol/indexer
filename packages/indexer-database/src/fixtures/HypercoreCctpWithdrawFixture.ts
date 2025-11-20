import { DataSource, DeleteResult, Repository } from "typeorm";
import { utils } from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";
import { ethers } from "ethers";

import { HypercoreCctpWithdraw } from "../entities";

export class HypercoreCctpWithdrawFixture {
  private repository: Repository<HypercoreCctpWithdraw>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(HypercoreCctpWithdraw);
  }

  /**
   * Creates a mock HypercoreCctpWithdraw object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock HypercoreCctpWithdraw object
   */
  public mockHypercoreCctpWithdraw(overrides: Partial<HypercoreCctpWithdraw>) {
    return {
      fromAddress: utils.randomAddress(),
      hypercoreNonce: utils.getRandomInt(1, 1_000_000).toString(),
      originChainId: CHAIN_IDs.HYPERCORE.toString(),
      destinationChainId: CHAIN_IDs.ARBITRUM.toString(),
      versionId: 0,
      declaredLength: 28,
      magicBytes: "cctp-forward",
      userData: "0x",
      burnTxnHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      ...overrides,
    };
  }

  /**
   * Inserts one or more HypercoreCctpWithdraw records into the database. If no items are provided,
   * a single mock record with default values will be inserted.
   * @param hypercoreCctpWithdraws - Array of partial HypercoreCctpWithdraw objects to insert
   * @returns Promise containing the result of the insert operation
   *
   * @example
   * const hypercoreCctpWithdrawFixture = new HypercoreCctpWithdrawFixture(dataSource);
   * const withdraw = hypercoreCctpWithdrawFixture.mockHypercoreCctpWithdraw({ fromAddress: "override with custom fromAddress" });
   * const savedWithdraw = await hypercoreCctpWithdrawFixture.insert([withdraw]);
   */
  public async insert(
    hypercoreCctpWithdraws: Partial<HypercoreCctpWithdraw>[] = [
      this.mockHypercoreCctpWithdraw({}),
    ],
  ): Promise<HypercoreCctpWithdraw[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(
        hypercoreCctpWithdraws.map((w) => this.mockHypercoreCctpWithdraw(w)),
      )
      .returning("*")
      .execute();

    return result.generatedMaps as [HypercoreCctpWithdraw];
  }

  /**
   * Deletes all HypercoreCctpWithdraw records from the database.
   * @returns Promise containing the result of the delete operation
   *
   * @example
   * const hypercoreCctpWithdrawFixture = new HypercoreCctpWithdrawFixture(dataSource);
   * await hypercoreCctpWithdrawFixture.deleteAll();
   */
  public deleteAll(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "public"."hypercore_cctp_withdraw" restart identity cascade`,
    );
  }
}
