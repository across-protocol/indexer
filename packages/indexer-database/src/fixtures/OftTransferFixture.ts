import { OftTransfer } from "../entities";
import { DataSource, DeleteResult, Repository } from "typeorm";

export class OftTransferFixture {
  private repository: Repository<OftTransfer>;

  public constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(OftTransfer);
  }

  /**
   * Deletes all OFT transfers from the database.
   * @returns Promise containing the result of the delete operation
   */
  public deleteAllOftTransfers(): Promise<DeleteResult> {
    return this.repository.query(
      `truncate table "oft_transfer" restart identity cascade`,
    );
  }
}
