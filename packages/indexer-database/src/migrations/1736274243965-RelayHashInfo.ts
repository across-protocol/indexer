import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1736274243965 implements MigrationInterface {
  name = "RelayHashInfo1736274243965";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "bridgeFeeUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "bridgeFeeUsd" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "inputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "inputPriceUsd" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "outputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "outputPriceUsd" double precision`,
    );
    await queryRunner.query(`ALTER TABLE "historic_price" DROP COLUMN "price"`);
    await queryRunner.query(
      `ALTER TABLE "historic_price" ADD "price" double precision NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "historic_price" DROP COLUMN "price"`);
    await queryRunner.query(
      `ALTER TABLE "historic_price" ADD "price" numeric NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "outputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "outputPriceUsd" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "inputPriceUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "inputPriceUsd" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "bridgeFeeUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "bridgeFeeUsd" character varying`,
    );
  }
}
