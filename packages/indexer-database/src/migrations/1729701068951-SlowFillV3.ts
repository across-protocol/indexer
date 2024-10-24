import { MigrationInterface, QueryRunner } from "typeorm";

export class SlowFillV31729701068951 implements MigrationInterface {
  name = "SlowFillV31729701068951";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP COLUMN "fromLiteChain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP COLUMN "toLiteChain"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD "toLiteChain" boolean NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD "fromLiteChain" boolean NOT NULL`,
    );
  }
}
