import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1727724776516 implements MigrationInterface {
  name = "V3FundsDeposited1727724776516";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "integratorId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "integratorId"`,
    );
  }
}
