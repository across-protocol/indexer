import { MigrationInterface, QueryRunner } from "typeorm";

export class RequestSpeedUp1749067055693 implements MigrationInterface {
  name = "RequestSpeedUp1749067055693";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ALTER COLUMN "originChainId" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ALTER COLUMN "originChainId" TYPE integer`,
    );
  }
}
