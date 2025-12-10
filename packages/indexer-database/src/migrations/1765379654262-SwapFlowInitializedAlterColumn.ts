import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSwapFlowInitializedSchema1765379654262
  implements MigrationInterface
{
  name = "UpdateSwapFlowInitializedSchema1765379654262";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" DROP COLUMN "evmAmountSponsored"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" ADD "evmAmountSponsored" numeric NOT NULL DEFAULT '0'`,
    );
  }
}
