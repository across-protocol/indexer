import { MigrationInterface, QueryRunner } from "typeorm";

export class ArbitraryActionsExecuted1762818039418
  implements MigrationInterface
{
  name = "ArbitraryActionsExecuted1762818039418";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."arbitrary_actions_executed" (
        "id" SERIAL NOT NULL,
        "quoteNonce" character varying,
        "initialToken" character varying NOT NULL,
        "initialAmount" numeric NOT NULL,
        "finalToken" character varying NOT NULL,
        "finalAmount" numeric NOT NULL,
        "finalised" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "chainId" bigint NOT NULL,
        "blockNumber" integer NOT NULL,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "transactionHash" character varying NOT NULL,
        "logIndex" integer NOT NULL,
        "transactionIndex" integer NOT NULL,
        CONSTRAINT "PK_arbitrary_actions_executed" PRIMARY KEY ("id"),
        CONSTRAINT "UK_arbitrary_actions_executed_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_chainId" ON "evm"."arbitrary_actions_executed" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_quoteNonce" ON "evm"."arbitrary_actions_executed" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_blockNumber" ON "evm"."arbitrary_actions_executed" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_finalised" ON "evm"."arbitrary_actions_executed" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_blockTimestamp" ON "evm"."arbitrary_actions_executed" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_arbitrary_actions_executed_deletedAt" ON "evm"."arbitrary_actions_executed" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_arbitrary_actions_executed_chainId"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."arbitrary_actions_executed"`);
  }
}
