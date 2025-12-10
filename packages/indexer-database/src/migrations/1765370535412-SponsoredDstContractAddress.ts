import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredDstContractAddress1765370535412
  implements MigrationInterface
{
  name = "SponsoredDstContractAddress1765370535412";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" ADD "contractAddress" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_contractAddress" ON "evm"."simple_transfer_flow_completed" ("contractAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_contractAddress" ON "evm"."arbitrary_actions_executed" ("contractAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_contractAddress" ON "evm"."fallback_hyper_evm_flow_completed" ("contractAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_contractAddress" ON "evm"."sponsored_account_activation" ("contractAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapFlowInitialized_contractAddress" ON "evm"."swap_flow_initialized" ("contractAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapFlowFinalized_contractAddress" ON "evm"."swap_flow_finalized" ("contractAddress") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_swapFlowFinalized_contractAddress"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_swapFlowInitialized_contractAddress"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_contractAddress"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_contractAddress"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_contractAddress"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" DROP COLUMN "contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" DROP COLUMN "contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" DROP COLUMN "contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" DROP COLUMN "contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" DROP COLUMN "contractAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" DROP COLUMN "contractAddress"`,
    );
  }
}
