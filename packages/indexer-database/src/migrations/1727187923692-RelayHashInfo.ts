import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1727187923692 implements MigrationInterface {
  name = "RelayHashInfo1727187923692";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "destinationChainId" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "depositTxHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillTxHash" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "depositTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "destinationChainId"`,
    );
  }
}
