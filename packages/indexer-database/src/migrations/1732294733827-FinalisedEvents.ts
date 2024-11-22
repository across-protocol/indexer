import { MigrationInterface, QueryRunner } from "typeorm";

export class FinalisedEvents1732294733827 implements MigrationInterface {
  name = "FinalisedEvents1732294733827";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_canceled" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_disputed" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "chainIds" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "chainIds" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_disputed" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_canceled" ALTER COLUMN "finalised" SET DEFAULT true`,
    );
  }
}
