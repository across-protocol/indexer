import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1733407862579 implements MigrationInterface {
  name = "V3FundsDeposited1733407862579";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "blockTimestamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "blockTimestamp" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "blockTimestamp"`,
    );
  }
}
