import { MigrationInterface, QueryRunner } from "typeorm";

export class SimpleTransferFlowCompleted1761511159903
  implements MigrationInterface
{
  name = "SimpleTransferFlowCompleted1761511159903";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."simple_transfer_flow_completed" (
        "id" SERIAL NOT NULL,
        "chainId" bigint NOT NULL,
        "quoteNonce" character varying,
        "finalRecipient" character varying NOT NULL,
        "finalToken" character varying NOT NULL,
        "evmAmountIn" bigint NOT NULL,
        "bridgingFeesIncurred" bigint NOT NULL,
        "evmAmountSponsored" bigint NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL DEFAULT false,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_simpleTransferFlowCompleted_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_simple_transfer_flow_completed" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_chainId" ON "evm"."simple_transfer_flow_completed" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_quoteNonce" ON "evm"."simple_transfer_flow_completed" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_finalRecipient" ON "evm"."simple_transfer_flow_completed" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_blockNumber" ON "evm"."simple_transfer_flow_completed" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_finalised" ON "evm"."simple_transfer_flow_completed" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_blockTimestamp" ON "evm"."simple_transfer_flow_completed" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_deletedAt" ON "evm"."simple_transfer_flow_completed" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_chainId"`,
    );
    await queryRunner.query(
      `DROP TABLE "evm"."simple_transfer_flow_completed"`,
    );
  }
}
