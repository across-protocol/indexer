import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredDepositForBurn1761511159902
  implements MigrationInterface
{
  name = "SponsoredDepositForBurn1761511159902";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."sponsored_deposit_for_burn" ("id" SERIAL NOT NULL, "chainId" character varying NOT NULL, "quoteNonce" character varying NOT NULL, "originSender" character varying NOT NULL, "final_recipient" character varying NOT NULL, "quote_deadline" character varying NOT NULL, "max_bps_to_sponsor" character varying NOT NULL, "max_user_slippage_bps" character varying NOT NULL, "final_token" character varying NOT NULL, "signature" character varying NOT NULL, "block_number" integer NOT NULL, "block_hash" character varying NOT NULL, "transaction_hash" character varying NOT NULL, "transaction_index" integer NOT NULL, "log_index" integer NOT NULL, "finalised" boolean NOT NULL DEFAULT false, "block_timestamp" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UK_sponsoredDepositForBurn_chainId_blockHash_logIndex" UNIQUE ("chainId", "block_hash", "log_index"), CONSTRAINT "PK_8e6356299f40faf6058a685d69a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fefe6a553be5ed4d140792d8be" ON "evm"."sponsored_deposit_for_burn" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f7d17d7d7d0605e7517f598520" ON "evm"."sponsored_deposit_for_burn" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bffe23d72c792ec1081f25d6a" ON "evm"."sponsored_deposit_for_burn" ("originSender") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f24a8b7dea058cbb46d169af9f" ON "evm"."sponsored_deposit_for_burn" ("final_recipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f3d978f025a3afb3757c4bbd0" ON "evm"."sponsored_deposit_for_burn" ("block_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_663184acf4a82d17f985987767" ON "evm"."sponsored_deposit_for_burn" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_020241551d2ab7e9c10e676fbc" ON "evm"."sponsored_deposit_for_burn" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_285ce24a9b6eede4b47d10adda" ON "evm"."sponsored_deposit_for_burn" ("deleted_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_285ce24a9b6eede4b47d10adda"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_020241551d2ab7e9c10e676fbc"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_663184acf4a82d17f985987767"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_5f3d978f025a3afb3757c4bbd0"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_f24a8b7dea058cbb46d169af9f"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_0bffe23d72c792ec1081f25d6a"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_f7d17d7d7d0605e7517f598520"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IDX_fefe6a553be5ed4d140792d8be"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."sponsored_deposit_for_burn"`);
  }
}
