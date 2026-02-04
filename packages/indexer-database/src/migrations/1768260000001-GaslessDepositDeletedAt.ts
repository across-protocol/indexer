import { MigrationInterface, QueryRunner } from "typeorm";

export class GaslessDepositDeletedAt1768260000001
  implements MigrationInterface
{
  name = "GaslessDepositDeletedAt1768260000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gasless_deposit"
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IX_gaslessDeposit_deletedAt"
      ON "gasless_deposit" ("deletedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IX_gaslessDeposit_deletedAt"`,
    );
    await queryRunner.query(`
      ALTER TABLE "gasless_deposit"
      DROP COLUMN IF EXISTS "deletedAt"
    `);
  }
}
