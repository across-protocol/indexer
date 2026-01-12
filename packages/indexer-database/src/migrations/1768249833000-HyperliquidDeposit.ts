import { MigrationInterface, QueryRunner } from "typeorm";

export class HyperliquidDeposit1768249833000 implements MigrationInterface {
  name = "HyperliquidDeposit1768249833000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "hyperliquid_deposit" (
            "id" SERIAL NOT NULL,
            "blockNumber" integer NOT NULL,
            "transactionHash" character varying NOT NULL,
            "transactionIndex" integer NOT NULL,
            "logIndex" integer NOT NULL,
            "blockTimestamp" TIMESTAMP NOT NULL,
            "user" character varying NOT NULL,
            "amount" numeric NOT NULL,
            "token" character varying NOT NULL,
            "depositType" character varying,
            "nonce" character varying,
            "rawData" text,
            "finalised" boolean NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "deletedAt" TIMESTAMP,
            CONSTRAINT "UK_hyperliquidDeposit_block_txn_log" UNIQUE ("blockNumber", "transactionHash", "logIndex"),
            CONSTRAINT "PK_hyperliquidDeposit" PRIMARY KEY ("id"))
        `);

    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_finalised" ON "hyperliquid_deposit" ("finalised")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_deletedAt" ON "hyperliquid_deposit" ("deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_user" ON "hyperliquid_deposit" ("user")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_blockTimestamp" ON "hyperliquid_deposit" ("blockTimestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "hyperliquid_deposit"`);
  }
}
