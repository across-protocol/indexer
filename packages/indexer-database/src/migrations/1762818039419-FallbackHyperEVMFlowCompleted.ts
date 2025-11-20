import { MigrationInterface, QueryRunner } from "typeorm";

export class FallbackHyperEVMFlowCompleted1762818039419
  implements MigrationInterface
{
  name = "FallbackHyperEVMFlowCompleted1762818039419";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."fallback_hyper_evm_flow_completed" (
        "id" SERIAL NOT NULL,
        "chainId" bigint NOT NULL,
        "quoteNonce" character varying,
        "finalRecipient" character varying NOT NULL,
        "finalToken" character varying NOT NULL,
        "evmAmountIn" numeric NOT NULL,
        "bridgingFeesIncurred" numeric NOT NULL,
        "evmAmountSponsored" numeric NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_fallback_hyper_evm_flow_completed" PRIMARY KEY ("id"),
        CONSTRAINT "UK_fallback_hyper_evm_flow_completed_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_chainId" ON "evm"."fallback_hyper_evm_flow_completed" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_quoteNonce" ON "evm"."fallback_hyper_evm_flow_completed" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_blockNumber" ON "evm"."fallback_hyper_evm_flow_completed" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_finalised" ON "evm"."fallback_hyper_evm_flow_completed" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_blockTimestamp" ON "evm"."fallback_hyper_evm_flow_completed" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_fallback_hyper_evm_flow_completed_deletedAt" ON "evm"."fallback_hyper_evm_flow_completed" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_fallback_hyper_evm_flow_completed_chainId"`,
    );
    await queryRunner.query(
      `DROP TABLE "evm"."fallback_hyper_evm_flow_completed"`,
    );
  }
}
