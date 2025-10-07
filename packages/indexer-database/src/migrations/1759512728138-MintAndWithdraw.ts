import { MigrationInterface, QueryRunner } from "typeorm";

export class MintAndWithdraw1759512728138 implements MigrationInterface {
  name = "MintAndWithdraw1759512728138";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."mint_and_withdraw" (
        "id" SERIAL NOT NULL,
        "mintRecipient" character varying NOT NULL,
        "amount" bigint NOT NULL,
        "mintToken" character varying NOT NULL,
        "feeCollected" bigint NOT NULL,
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
        CONSTRAINT "UK_mintAndWithdraw_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"),
        CONSTRAINT "PK_2af62c40bf853fe4063706d2034" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mintAndWithdraw_deletedAt" ON "evm"."mint_and_withdraw" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mintAndWithdraw_finalised" ON "evm"."mint_and_withdraw" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_mintAndWithdraw_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_mintAndWithdraw_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."mint_and_withdraw"`);
  }
}
