import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1737658101626 implements MigrationInterface {
  name = "V3FundsDeposited1737658101626";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "quoteBlockNumber"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "quoteBlockNumber" integer NOT NULL`,
    );
  }
}
