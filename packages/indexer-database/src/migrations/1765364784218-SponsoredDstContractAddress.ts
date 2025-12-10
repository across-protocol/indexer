import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredDstContractAddress1765364784218
  implements MigrationInterface
{
  name = "SponsoredDstContractAddress1765364784218";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" ADD "address" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" ADD "address" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" ADD "address" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" ADD "address" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" ADD "address" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" ADD "address" character varying`,
    );

    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_address" ON "evm"."simple_transfer_flow_completed" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_address" ON "evm"."arbitrary_actions_executed" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_address" ON "evm"."fallback_hyper_evm_flow_completed" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_address" ON "evm"."sponsored_account_activation" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapFlowInitialized_address" ON "evm"."swap_flow_initialized" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapFlowFinalized_address" ON "evm"."swap_flow_finalized" ("address") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_swapFlowFinalized_address"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_swapFlowInitialized_address"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_address"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_address"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_address"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" DROP COLUMN "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" DROP COLUMN "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" DROP COLUMN "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" DROP COLUMN "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" DROP COLUMN "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" DROP COLUMN "address"`,
    );
  }
}
