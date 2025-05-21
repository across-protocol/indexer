import { MigrationInterface, QueryRunner } from "typeorm";

export class HubPoolEventsChainType1747773035048 implements MigrationInterface {
  name = "HubPoolEventsChainType1747773035048";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ALTER COLUMN "chainId" TYPE bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ALTER COLUMN "destinationChainId" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."root_bundle_executed" ALTER COLUMN "chainId" TYPE integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."set_pool_rebalance_route" ALTER COLUMN "destinationChainId" TYPE integer`,
    );
  }
}
