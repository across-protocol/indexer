import { MigrationInterface, QueryRunner } from "typeorm";

export class ClaimedRelayerRefunds1755720402358 implements MigrationInterface {
  name = "ClaimedRelayerRefunds1755720402358";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."claimed_relayer_refunds" ALTER COLUMN "caller" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."claimed_relayer_refunds" ALTER COLUMN "caller" SET NOT NULL`,
    );
  }
}
