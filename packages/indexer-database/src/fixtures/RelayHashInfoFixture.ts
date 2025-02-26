import { RelayHashInfo } from "../entities";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class RelayHashInfoFixture {
  private repository: Repository<RelayHashInfo>;
  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(RelayHashInfo);
  }

  /**
   * Deletes all relayHashInfo rows from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllRelayHashInfoRows(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table relay_hash_info restart identity cascade`,
    );
  }
}
