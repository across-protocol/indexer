import { MigrationInterface, QueryRunner } from "typeorm";

export class CallsFailed1755122451833 implements MigrationInterface {
  name = "CallsFailed1755122451833";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."calls_failed" ("id" SERIAL NOT NULL,
        "calls" jsonb NOT NULL,
        "fallbackRecipient" character varying NOT NULL,
        "blockHash" character varying NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "logIndex" integer NOT NULL,
        "chainId" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_callsFailed_blockNumber_chainId_logIndex" UNIQUE ("blockNumber", "chainId", "logIndex"),
        CONSTRAINT "PK_0ec70ee890d3736415ade0f2839" PRIMARY KEY ("id")
        )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_callsFailed_deletedAt" ON "evm"."calls_failed" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_callsFailed_finalised" ON "evm"."calls_failed" ("finalised") `,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "callsFailedEventId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UQ_f20bf722db21ab38ab80375c2ec" UNIQUE ("callsFailedEventId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info"
      ADD CONSTRAINT "FK_relayHashInfo_callsFailedEventId" FOREIGN KEY ("callsFailedEventId") REFERENCES "evm"."calls_failed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_callsFailedEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UQ_f20bf722db21ab38ab80375c2ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "callsFailedEventId"`,
    );
    await queryRunner.query(`DROP INDEX "evm"."IX_callsFailed_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_callsFailed_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."calls_failed"`);
  }
}
