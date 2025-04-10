import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1744307085174 implements MigrationInterface {
  name = "V3FundsDeposited1744307085174";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_depositor" ON "evm"."v3_funds_deposited" ("depositor") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_status" ON "relay_hash_info" ("status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IX_rhi_status"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_v3FundsDeposited_depositor"`);
  }
}
