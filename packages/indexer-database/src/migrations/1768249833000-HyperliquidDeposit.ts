import { MigrationInterface, QueryRunner } from "typeorm";

export class HyperliquidDeposit1768249833000 implements MigrationInterface {
  name = "HyperliquidDeposit1768249833000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "hyperliquid_deposit" (
            "id" SERIAL NOT NULL,
            "blockNumber" integer NOT NULL,
            "transactionHash" character varying NOT NULL,
            "blockTimestamp" TIMESTAMP NOT NULL,
            "user" character varying NOT NULL,
            "amount" numeric NOT NULL,
            "token" character varying NOT NULL,
            "depositType" character varying,
            "nonce" character varying NOT NULL,
            "hypercoreIdentifier" character varying NOT NULL,
            "cctpBurnEventId" integer,
            "finalised" boolean NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "deletedAt" TIMESTAMP,
            CONSTRAINT "UK_hyperliquidDeposit_hypercore_identifier" UNIQUE ("hypercoreIdentifier"),
            CONSTRAINT "FK_hyperliquidDeposit_cctpBurnEventId" FOREIGN KEY ("cctpBurnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
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
    await queryRunner.query(
      `CREATE INDEX "IX_hyperliquidDeposit_cctpBurnEventId" ON "hyperliquid_deposit" ("cctpBurnEventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "hyperliquid_deposit"`);
  }
}
