import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1735922359359 implements MigrationInterface {
  name = "RelayHashInfo1735922359359";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "bridgeFeeUsd" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "inputPriceUsd" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "outputPriceUsd" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "bridgeFeeUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "outputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "inputPriceUsd"`,
    );
  }
}
