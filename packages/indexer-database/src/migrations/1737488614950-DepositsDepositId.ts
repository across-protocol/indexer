import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositId1737488614950 implements MigrationInterface {
  name = "DepositId1737488614950";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.v3_funds_deposited alter column "depositId" type numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.v3_funds_deposited alter column "depositId" type integer`,
    );
  }
}
