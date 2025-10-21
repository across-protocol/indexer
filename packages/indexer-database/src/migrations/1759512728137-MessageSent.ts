import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageSent1759512728137 implements MigrationInterface {
  name = "MessageSent1759512728137";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."message_sent" (
        "id" SERIAL NOT NULL,
        "message" character varying NOT NULL,
        "version" integer NOT NULL,
        "sourceDomain" integer NOT NULL,
        "destinationDomain" integer NOT NULL,
        "nonce" character varying NOT NULL,
        "sender" character varying NOT NULL,
        "recipient" character varying NOT NULL,
        "destinationCaller" character varying NOT NULL,
        "minFinalityThreshold" integer NOT NULL,
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
        CONSTRAINT "UK_messageSent_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_8b1b9e0af3eac42a29879166fbb" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageSent_deletedAt" ON "evm"."message_sent" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageSent_finalised" ON "evm"."message_sent" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_messageSent_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_messageSent_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."message_sent"`);
  }
}
