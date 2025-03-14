import { MigrationInterface, QueryRunner } from "typeorm";

export class DecimalPriceColumns1739385066933 implements MigrationInterface {
  name = "DecimalPriceColumns1739385066933";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "bridgeFeeUsd" TYPE numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "inputPriceUsd" TYPE numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "outputPriceUsd" TYPE numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "historic_price" ALTER COLUMN "price" TYPE numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "bridgeFeeUsd" TYPE double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "inputPriceUsd" TYPE double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "outputPriceUsd" TYPE double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "historic_price" ALTER COLUMN "price" TYPE double precision`,
    );
  }
}
