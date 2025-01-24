import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1737752107825 implements MigrationInterface {
  name = "RelayHashInfo1737752107825";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_origin_deadline_status" ON "relay_hash_info" ("originChainId", "fillDeadline", "status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_rhi_origin_deadline_status"`,
    );
  }
}
