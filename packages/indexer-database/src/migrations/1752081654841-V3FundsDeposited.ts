import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1752081654841 implements MigrationInterface {
  name = "V3FundsDeposited1752081654841";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_internalHash" ON "evm"."v3_funds_deposited" ("internalHash") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_internalHash"`,
    );
  }
}
