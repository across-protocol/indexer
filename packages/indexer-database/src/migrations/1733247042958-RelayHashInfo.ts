import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1733247042958 implements MigrationInterface {
  name = "RelayHashInfo1733247042958";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_depositTxHash" ON "relay_hash_info" ("depositTxHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_originChainId_depositId" ON "relay_hash_info" ("originChainId", "depositId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_rhi_originChainId_depositId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IX_rhi_depositTxHash"`);
  }
}
