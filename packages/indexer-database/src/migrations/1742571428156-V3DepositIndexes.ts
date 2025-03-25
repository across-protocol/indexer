import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1742571428156 implements MigrationInterface {
  name = "Migrations1742571428156";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_blockTimestamp" ON "evm"."v3_funds_deposited" ("blockTimestamp") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_blockTimestamp"`,
    );
  }
}
