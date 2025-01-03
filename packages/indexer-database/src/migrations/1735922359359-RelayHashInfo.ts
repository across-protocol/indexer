import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1735922359359 implements MigrationInterface {
  name = "RelayHashInfo1735922359359";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "bridgeFeeUsd" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "bridgeFeeUsd"`,
    );
  }
}
