import { MigrationInterface, QueryRunner } from "typeorm";

export class SpokePoolFinalised1728296909794 implements MigrationInterface {
  name = "SpokePoolFinalised1728296909794";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ADD "finalised" boolean DEFAULT false NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "finalised"`,
    );
  }
}
