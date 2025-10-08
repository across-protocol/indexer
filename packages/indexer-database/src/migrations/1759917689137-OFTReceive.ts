import { MigrationInterface, QueryRunner } from "typeorm";

export class OFTReceive1759917689137 implements MigrationInterface {
  name = "OFTReceive1759917689137";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evm"."oft_received" (
        "id" SERIAL NOT NULL,
        "guid" character varying NOT NULL,
        "srcEid" integer NOT NULL,
        "toAddress" character varying NOT NULL,
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
        CONSTRAINT "UK_oftReceived_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"),
        CONSTRAINT "PK_67afb13cb031b96f7620ea870a1" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IX_oftReceived_deletedAt" ON "evm"."oft_received" ("deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oftReceived_finalised" ON "evm"."oft_received" ("finalised")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_oftReceived_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_oftReceived_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."oft_received"`);
  }
}
