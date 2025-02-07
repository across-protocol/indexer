import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1738886982008 implements MigrationInterface {
  name = "V3FundsDeposited1738886982008";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "messageHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "internalHash" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "messageHash"`,
    );
  }
}
