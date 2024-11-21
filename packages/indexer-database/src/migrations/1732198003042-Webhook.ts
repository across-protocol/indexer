import { MigrationInterface, QueryRunner } from "typeorm";

export class Webhook1732198003042 implements MigrationInterface {
  name = "Webhook1732198003042";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_request" ("id" character varying NOT NULL, "url" character varying NOT NULL, "filter" character varying NOT NULL, CONSTRAINT "PK_67a7784045de2d1b7139b611b93" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_client" ("name" character varying NOT NULL, "id" character varying NOT NULL, "apiKey" character varying NOT NULL, "domains" text NOT NULL, CONSTRAINT "PK_f7330fb3bdb2e19534eae691d44" PRIMARY KEY ("id"))`,
    );
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
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ALTER COLUMN "chainIds" SET DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_disputed" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_canceled" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(`DROP TABLE "webhook_client"`);
    await queryRunner.query(`DROP TABLE "webhook_request"`);
  }
}
