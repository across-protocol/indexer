import { MigrationInterface, QueryRunner } from "typeorm";

export class OFTSent1759917689136 implements MigrationInterface {
  name = "OFTSent1759917689136";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evm"."oft_sent" (
        "id" SERIAL NOT NULL,
        "guid" character varying NOT NULL,
        "dstEid" integer NOT NULL,
        "fromAddress" character varying NOT NULL,
        "amountSentLD" bigint NOT NULL,
        "amountReceivedLD" bigint NOT NULL,
        "token" character varying NOT NULL,
        "chainId" bigint NOT NULL,
        "blockHash" character varying NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_oftSent_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"),
        CONSTRAINT "PK_3ddffb71b35c6ee2dc8dd33ed74" PRIMARY KEY ("id")
      )
  `);
    await queryRunner.query(
      `CREATE INDEX "IX_oftSent_deletedAt" ON "evm"."oft_sent" ("deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oftSent_finalised" ON "evm"."oft_sent" ("finalised")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_oftSent_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_oftSent_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."oft_sent"`);
  }
}
