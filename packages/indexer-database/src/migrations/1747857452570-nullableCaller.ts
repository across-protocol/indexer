import { MigrationInterface, QueryRunner } from "typeorm";

export class NullableCaller1747857452570 implements MigrationInterface {
  name = "NullableCaller1747857452570";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "caller" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "caller" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "caller" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "caller" SET NOT NULL`,
    );
  }
}
