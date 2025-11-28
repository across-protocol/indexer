import { MigrationInterface, QueryRunner } from "typeorm";

export class ForeignKeyIndexes1764096928688 implements MigrationInterface {
  name = "ForeignKeyIndexes1764096928688";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_relayHashInfoId_side_deletedAt" ON "evm"."swap_metadata" ("relayHashInfoId", "side", "deletedAt") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oftReceived_guid_deletedAt" ON "evm"."oft_received" ("guid", "deletedAt") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_oftReceived_guid_deletedAt"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_swapMetadata_relayHashInfoId_side_deletedAt"`,
    );
  }
}
