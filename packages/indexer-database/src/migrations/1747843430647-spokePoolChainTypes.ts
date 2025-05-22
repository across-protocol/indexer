import { MigrationInterface, QueryRunner } from "typeorm";

export class SpokePoolChainTypes1747843430647 implements MigrationInterface {
  name = "SpokePoolChainTypes1747843430647";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // executed_relayer_refund_root
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "chainId" TYPE bigint`,
    );
    // relayed_root_bundle
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ALTER COLUMN "chainId" TYPE bigint`,
    );
    // tokens_bridged
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "chainId" TYPE bigint`,
    );
    // bundle_event
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ALTER COLUMN "eventChainId" TYPE bigint`,
    );
    // bundle_block_range
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" ALTER COLUMN "chainId" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // executed_relayer_refund_root
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ALTER COLUMN "chainId" TYPE integer`,
    );
    // relayed_root_bundle
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ALTER COLUMN "chainId" TYPE integer`,
    );
    // tokens_bridged
    await queryRunner.query(
      `ALTER TABLE "evm"."tokens_bridged" ALTER COLUMN "chainId" TYPE integer`,
    );
    // bundle_event
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ALTER COLUMN "eventChainId" TYPE integer`,
    );
    // bundle_block_range
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" ALTER COLUMN "chainId" TYPE integer`,
    );
  }
}
