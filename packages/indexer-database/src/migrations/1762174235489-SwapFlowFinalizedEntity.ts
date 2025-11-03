import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSwapFlowFinalizedEntity1762174235489
  implements MigrationInterface
{
  name = "CreateSwapFlowFinalizedEntity1762174235489";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "evm"."swap_flow_finalized" (
            "id" SERIAL NOT NULL,
            "chainId" bigint NOT NULL,
            "quoteNonce" character varying,
            "finalRecipient" character varying NOT NULL,
            "finalToken" character varying NOT NULL,
            "totalSent" bigint NOT NULL,
            "evmAmountSponsored" bigint NOT NULL,
            "blockNumber" integer NOT NULL,
            "transactionIndex" integer NOT NULL,
            "transactionHash" character varying NOT NULL,
            "logIndex" integer NOT NULL,
            "finalised" boolean NOT NULL,
            "blockTimestamp" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "deletedAt" TIMESTAMP,
            CONSTRAINT "UK_swapFlowFinalized_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
            CONSTRAINT "PK_ec8b3a9daed0304a1c6c9e9f784" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_deletedAt" ON "evm"."swap_flow_finalized" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_createdAt" ON "evm"."swap_flow_finalized" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_blockNumber" ON "evm"."swap_flow_finalized" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_finalRecipient" ON "evm"."swap_flow_finalized" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_quoteNonce" ON "evm"."swap_flow_finalized" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowFinalized_chainId" ON "evm"."swap_flow_finalized" ("chainId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_SwapFlowFinalized_chainId"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowFinalized_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowFinalized_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowFinalized_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowFinalized_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowFinalized_deletedAt"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."swap_flow_finalized"`);
  }
}
