import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredDepositForBurn1761511159902
  implements MigrationInterface
{
  name = "SponsoredDepositForBurn1761511159902";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."sponsored_deposit_for_burn" (
        "id" SERIAL NOT NULL,
        "chainId" bigint NOT NULL,
        "quoteNonce" character varying,
        "originSender" character varying NOT NULL,
        "finalRecipient" character varying NOT NULL,
        "quoteDeadline" TIMESTAMP NOT NULL,
        "maxBpsToSponsor" character varying NOT NULL,
        "maxUserSlippageBps" character varying NOT NULL,
        "finalToken" character varying NOT NULL,
        "signature" character varying NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL DEFAULT false,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_sponsoredDepositForBurn_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_8e6356299f40faf6058a685d69a" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_chainId" ON "evm"."sponsored_deposit_for_burn" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_quoteNonce" ON "evm"."sponsored_deposit_for_burn" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_originSender" ON "evm"."sponsored_deposit_for_burn" ("originSender") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_finalRecipient" ON "evm"."sponsored_deposit_for_burn" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_blockNumber" ON "evm"."sponsored_deposit_for_burn" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_finalised" ON "evm"."sponsored_deposit_for_burn" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_blockTimestamp" ON "evm"."sponsored_deposit_for_burn" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredDepositForBurn_deletedAt" ON "evm"."sponsored_deposit_for_burn" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_originSender"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredDepositForBurn_chainId"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."sponsored_deposit_for_burn"`);
  }
}
