import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositsDeletedAt1738721858386 implements MigrationInterface {
  name = "DepositsDeletedAt1738721858386";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "deletedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_deletedAt" ON "evm"."v3_funds_deposited" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_v3FundsDeposited_deletedAt"`);
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "deletedAt"`,
    );
  }
}
