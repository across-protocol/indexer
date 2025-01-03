import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1735924259108 implements MigrationInterface {
  name = "RelayHashInfo1735924259108";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "inputPriceUsd" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "outputPriceUsd" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "outputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "inputPriceUsd"`,
    );
  }
}
