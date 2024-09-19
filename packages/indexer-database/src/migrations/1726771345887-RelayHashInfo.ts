import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1726771345887 implements MigrationInterface {
  name = "RelayHashInfo1726771345887";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillDeadline" TIMESTAMP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "depositRefundTxHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."relay_hash_info_status_enum" AS ENUM('unfilled', 'filled', 'slowFillRequested', 'slowFilled', 'expired', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "status" "public"."relay_hash_info_status_enum" NOT NULL DEFAULT 'unfilled'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "status"`,
    );
    await queryRunner.query(`DROP TYPE "public"."relay_hash_info_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "status" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "depositRefundTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillDeadline"`,
    );
  }
}
