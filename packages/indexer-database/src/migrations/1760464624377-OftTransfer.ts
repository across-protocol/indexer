import { MigrationInterface, QueryRunner } from "typeorm";

export class OftTransfer1760464624377 implements MigrationInterface {
  name = "OftTransfer1760464624377";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" ADD CONSTRAINT "UQ_85fc3827b7381fa02ef4e01f008" UNIQUE ("guid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oft_transfer_status" ON "oft_transfer" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oft_transfer_origin_txn_ref" ON "oft_transfer" ("originTxnRef") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IX_oft_transfer_origin_txn_ref"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IX_oft_transfer_status"`);
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" DROP CONSTRAINT "UQ_85fc3827b7381fa02ef4e01f008"`,
    );
  }
}
