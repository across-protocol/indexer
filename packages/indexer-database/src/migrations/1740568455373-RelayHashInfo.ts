import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1740568455373 implements MigrationInterface {
  name = "RelayHashInfo1740568455373";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapTokenPriceUsd" numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapFeeUsd" numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapFeeUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapTokenPriceUsd"`,
    );
  }
}
