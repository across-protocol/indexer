import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1742390524038 implements MigrationInterface {
  name = "RelayHashInfo1742390524038";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "gasTokenPriceUsd" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "gasFee" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "gasFeeUsd" numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "gasFee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "gasTokenPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "gasFeeUsd"`,
    );
  }
}
