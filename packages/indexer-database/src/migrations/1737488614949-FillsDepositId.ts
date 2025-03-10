import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositId1737488614949 implements MigrationInterface {
  name = "DepositId1737488614949";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.filled_v3_relay alter column "depositId" type numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.filled_v3_relay alter column "depositId" type integer`,
    );
  }
}
