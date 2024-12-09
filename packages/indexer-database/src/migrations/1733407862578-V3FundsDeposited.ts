import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1733407862578 implements MigrationInterface {
  name = "V3FundsDeposited1733407862578";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "blockTimestamp" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "blockTimestamp"`,
    );
  }
}
