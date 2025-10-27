import { MigrationInterface, QueryRunner } from "typeorm";

export class ArbitraryActionsExecuted1761511159903
  implements MigrationInterface
{
  name = "ArbitraryActionsExecuted1761511159903";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."arbitrary_actions_executed" ("id" SERIAL NOT NULL, "chainId" character varying NOT NULL, "quoteNonce" character varying NOT NULL, "initialToken" character varying NOT NULL, "initialAmount" character varying NOT NULL, "finalToken" character varying NOT NULL, "finalAmount" character varying NOT NULL, "block_number" integer NOT NULL, "block_hash" character varying NOT NULL, "transaction_hash" character varying NOT NULL, "transaction_index" integer NOT NULL, "log_index" integer NOT NULL, "finalised" boolean NOT NULL DEFAULT false, "block_timestamp" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UK_arbitraryActionsExecuted_chainId_blockHash_logIndex" UNIQUE ("chainId", "block_hash", "log_index"), CONSTRAINT "PK_arbitraryActionsExecuted" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_chainId" ON "evm"."arbitrary_actions_executed" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_quoteNonce" ON "evm"."arbitrary_actions_executed" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_initialToken" ON "evm"."arbitrary_actions_executed" ("initialToken") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_finalToken" ON "evm"."arbitrary_actions_executed" ("finalToken") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_block_number" ON "evm"."arbitrary_actions_executed" ("block_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_finalised" ON "evm"."arbitrary_actions_executed" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_created_at" ON "evm"."arbitrary_actions_executed" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_arbitraryActionsExecuted_deleted_at" ON "evm"."arbitrary_actions_executed" ("deleted_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_block_number"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_finalToken"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_initialToken"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_arbitraryActionsExecuted_chainId"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."arbitrary_actions_executed"`);
  }
}
