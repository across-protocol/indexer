import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveHyperliquidDepositCctpBurnEventId1768250000000
  implements MigrationInterface
{
  name = "RemoveHyperliquidDepositCctpBurnEventId1768250000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "hyperliquid_deposit" DROP CONSTRAINT IF EXISTS "FK_hyperliquidDeposit_cctpBurnEventId"`,
    );

    // Drop the index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IX_hyperliquidDeposit_cctpBurnEventId"`,
    );

    // Drop the column
    await queryRunner.query(
      `ALTER TABLE "hyperliquid_deposit" DROP COLUMN IF EXISTS "cctpBurnEventId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the column
    await queryRunner.query(
      `ALTER TABLE "hyperliquid_deposit" ADD "cctpBurnEventId" integer`,
    );

    // Re-add the index
    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_cctpBurnEventId" ON "hyperliquid_deposit" ("cctpBurnEventId")`,
    );

    // Re-add the foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "hyperliquid_deposit" ADD CONSTRAINT "FK_hyperliquidDeposit_cctpBurnEventId" FOREIGN KEY ("cctpBurnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
