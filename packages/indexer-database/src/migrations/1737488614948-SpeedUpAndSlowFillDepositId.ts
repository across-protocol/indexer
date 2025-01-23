import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositId1737488614948 implements MigrationInterface {
  name = "DepositId1737488614948";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.requested_speed_up_v3_deposit alter column "depositId" type numeric`,
    );
    await queryRunner.query(
      `alter table evm.requested_v3_slow_fill alter column "depositId" type numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.requested_speed_up_v3_deposit alter column "depositId" type integer`,
    );
    await queryRunner.query(
      `alter table evm.requested_v3_slow_fill alter column "depositId" type integer`,
    );
  }
}
