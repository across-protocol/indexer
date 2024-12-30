import { MigrationInterface, QueryRunner } from "typeorm";

export class FilledV3Relay1734957371550 implements MigrationInterface {
  name = "FilledV3Relay1734957371550";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "blockTimestamp" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "blockTimestamp"`,
    );
  }
}
