import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1742390524038 implements MigrationInterface {
  name = "RelayHashInfo1742390524038";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillGasTokenPriceUsd" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillGasFee" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillGasFeeUsd" numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillGasTokenPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillGasFee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillGasFeeUsd"`,
    );
  }
}
