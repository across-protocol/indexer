import { MigrationInterface, QueryRunner } from "typeorm";

export class SponsoredAccountActivation1763557964556
  implements MigrationInterface
{
  name = "SponsoredAccountActivation1763557964556";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."sponsored_account_activation" (
        "id" SERIAL NOT NULL,
        "chainId" bigint NOT NULL,
        "quoteNonce" character varying,
        "finalRecipient" character varying NOT NULL,
        "fundingToken" character varying NOT NULL,
        "evmAmountSponsored" numeric NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL DEFAULT false,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_sponsoredAccountActivation_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_sponsoredAccountActivation_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_chainId" ON "evm"."sponsored_account_activation" ("chainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_quoteNonce" ON "evm"."sponsored_account_activation" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_finalRecipient" ON "evm"."sponsored_account_activation" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_blockNumber" ON "evm"."sponsored_account_activation" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_finalised" ON "evm"."sponsored_account_activation" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_blockTimestamp" ON "evm"."sponsored_account_activation" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredAccountActivation_deletedAt" ON "evm"."sponsored_account_activation" ("deletedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_deletedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_blockTimestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredAccountActivation_chainId"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."sponsored_account_activation"`);
  }
}
