import { MigrationInterface, QueryRunner } from "typeorm";

export class HubPoolFinalised1727686818331 implements MigrationInterface {
  name = "HubPoolFinalised1727686818331";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" DROP CONSTRAINT "UK_setPoolRebalanceRoute_transactionHash_transactionIndex_logIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ADD CONSTRAINT "UK_spr_transactionHash_transactionIndex_logIndex" UNIQUE ("transactionHash", "transactionIndex", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ADD "finalised" boolean DEFAULT true NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_disputed" ADD "finalised" boolean DEFAULT true NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ADD "finalised" boolean DEFAULT true NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_canceled" ADD "finalised" boolean DEFAULT true NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ADD "finalised" boolean DEFAULT true NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" DROP CONSTRAINT "UK_spr_transactionHash_transactionIndex_logIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ADD CONSTRAINT "UK_setPoolRebalanceRoute_transactionHash_transactionIndex_logIn" UNIQUE ("transactionHash", "transactionIndex", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_disputed" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" DROP COLUMN "finalised"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_canceled" DROP COLUMN "finalised"`,
    );
  }
}
