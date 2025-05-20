import { MigrationInterface, QueryRunner } from "typeorm";

export class SpokePoolEventsChainType21747776000953
  implements MigrationInterface
{
  name = "SpokePoolEventsChainType21747776000953";

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
  }
}
