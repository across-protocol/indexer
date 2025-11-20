import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapFlowInitialized1763651311589 implements MigrationInterface {
  name = "SwapFlowInitialized1763651311589";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."swap_flow_initialized" (
        "id" SERIAL NOT NULL,
        "chainId" bigint NOT NULL,
        "quoteNonce" character varying,
        "finalRecipient" character varying NOT NULL,
        "finalToken" character varying NOT NULL,
        "evmAmountIn" numeric NOT NULL,
        "bridgingFeesIncurred" numeric NOT NULL,
        "evmAmountSponsored" numeric NOT NULL,
        "coreAmountIn", numeric NOT NULL,
        "minAmountToSend" numeric NOT NULL,
        "maxAmountToSend" numeric NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL DEFAULT false,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_swapFlowInitialized_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_swap_flow_initialized" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_chainId" ON "evm"."swap_flow_initialized" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_quoteNonce" ON "evm"."swap_flow_initialized" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_finalRecipient" ON "evm"."swap_flow_initialized" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_blockNumber" ON "evm"."swap_flow_initialized" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_finalised" ON "evm"."swap_flow_initialized" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_blockTimestamp" ON "evm"."swap_flow_initialized" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SwapFlowInitialized_deletedAt" ON "evm"."swap_flow_initialized" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SwapFlowInitialized_chainId"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."swap_flow_initialized"`);
  }
}
