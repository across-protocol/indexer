import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1737653335019 implements MigrationInterface {
  name = "RelayHashInfo1737653335019";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapFeeInputAmount" numeric NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapInputTokenName" character varying NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapOutputTokenName" character varying NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapFeeUsdAmount" numeric NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapFeeUsdAmount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapFeeInputAmount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapInputTokenName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapOutputTokenName"`,
    );
  }
}
