import { RelayHashInfo, RelayStatus } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, DeleteResult, InsertResult, Repository } from "typeorm";

export class RelayHashInfoFixture {
  private repository: Repository<RelayHashInfo>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(RelayHashInfo);
  }

  /**
   * Creates a mock RelayHashInfo object with default values.
   * @param overrides - Partial object to override default values
   * @returns Mock RelayHashInfo object
   */
  public mockRelayHashInfo(overrides: Partial<RelayHashInfo>) {
    return {
      id: 1,
      relayHash: "0xaaa",
      internalHash: "0xaaa",
      depositId: getRandomInt().toString(),
      originChainId: 1,
      destinationChainId: 10,
      depositTxHash: "0x",
      fillTxHash: "0x",
      fillDeadline: new Date(),
      status: RelayStatus.Unfilled,
      depositRefundTxHash: "0x",
      swapTokenPriceUsd: "1.0",
      swapFeeUsd: "0.1",
      bridgeFeeUsd: "0.05",
      inputPriceUsd: "1.0",
      outputPriceUsd: "0.9",
      fillGasFee: "0.01",
      fillGasFeeUsd: "0.01",
      fillGasTokenPriceUsd: "1.0",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Inserts one or more relay hash infos into the database. If no relay hash infos are provided,
   * a single mock relay hash info with default values will be inserted.
   * @param relayHashInfos - Array of partial RelayHashInfo objects to insert
   * @returns Promise containing the result of the insert operation
   */
  public async insertRelayHashInfos(
    relayHashInfos: Partial<RelayHashInfo>[],
  ): Promise<[RelayHashInfo, ...RelayHashInfo[]]> {
    if (relayHashInfos.length === 0) {
      relayHashInfos.push(this.mockRelayHashInfo({}));
    }
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(relayHashInfos.map((info) => this.mockRelayHashInfo(info)))
      .returning("*")
      .execute();

    return result.generatedMaps as [RelayHashInfo, ...RelayHashInfo[]];
  }

  /**
   * Deletes all relay hash infos from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllRelayHashInfoRows(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "relay_hash_info" restart identity cascade`,
    );
  }
}
