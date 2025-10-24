import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredDepositForBurn1761322378171
  implements MigrationInterface
{
  name = "SponsoredDepositForBurn1761322378171";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sponsored_deposit_for_burn" ("id" character varying NOT NULL, "quoteNonce" character varying NOT NULL, "originSender" character varying NOT NULL, "finalRecipient" character varying NOT NULL, "quoteDeadline" character varying NOT NULL, "maxBpsToSponsor" character varying NOT NULL, "maxUserSlippageBps" character varying NOT NULL, "finalToken" character varying NOT NULL, "signature" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL DEFAULT false, "blockTimestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_8e6356299f40faf6058a685d69a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f7d17d7d7d0605e7517f598520" ON "sponsored_deposit_for_burn" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bffe23d72c792ec1081f25d6a" ON "sponsored_deposit_for_burn" ("originSender") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_25d1b46276465f5342d2d533d6" ON "sponsored_deposit_for_burn" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c88d651bfcb6187ad62384cf7" ON "sponsored_deposit_for_burn" ("blockNumber") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c88d651bfcb6187ad62384cf7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_25d1b46276465f5342d2d533d6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0bffe23d72c792ec1081f25d6a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f7d17d7d7d0605e7517f598520"`,
    );
    await queryRunner.query(`DROP TABLE "sponsored_deposit_for_burn"`);
  }
}
