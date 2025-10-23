import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageReceived1759512728139 implements MigrationInterface {
  name = "MessageReceived1759512728139";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."message_received" (
        "id" SERIAL NOT NULL,
        "caller" character varying NOT NULL,
        "sourceDomain" integer NOT NULL,
        "nonce" character varying NOT NULL,
        "sender" character varying NOT NULL,
        "finalityThresholdExecuted" integer NOT NULL,
        "messageBody" character varying NOT NULL,
        "chainId" bigint NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_messageReceived_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_de337d8e9174f97ff01ac04fbaa" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageReceived_deletedAt" ON "evm"."message_received" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageReceived_finalised" ON "evm"."message_received" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_messageReceived_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_messageReceived_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."message_received"`);
  }
}
