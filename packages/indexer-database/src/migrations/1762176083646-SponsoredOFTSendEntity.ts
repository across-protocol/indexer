import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSponsoredOFTSendEntity1762176083646
  implements MigrationInterface
{
  name = "CreateSponsoredOFTSendEntity1762176083646";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "evm"."sponsored_oft_send" (
            "id" SERIAL NOT NULL,
            "chainId" bigint NOT NULL,
            "quoteNonce" character varying,
            "originSender" character varying NOT NULL,
            "finalRecipient" character varying NOT NULL,
            "destinationHandler" character varying NOT NULL,
            "quoteDeadline" TIMESTAMP NOT NULL,
            "maxBpsToSponsor" bigint NOT NULL,
            "maxUserSlippageBps" bigint NOT NULL,
            "finalToken" character varying NOT NULL,
            "sig" character varying NOT NULL,
            "blockNumber" integer NOT NULL,
            "transactionHash" character varying NOT NULL,
            "transactionIndex" integer NOT NULL,
            "logIndex" integer NOT NULL,
            "finalised" boolean NOT NULL,
            "blockTimestamp" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "deletedAt" TIMESTAMP,
            CONSTRAINT "UK_sponsoredOFTSend_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
            CONSTRAINT "PK_5183667b193475a4e175f9b4a75" PRIMARY KEY ("id")
        )`);
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_deletedAt" ON "evm"."sponsored_oft_send" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_finalised" ON "evm"."sponsored_oft_send" ("finalised") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_blockNumber" ON "evm"."sponsored_oft_send" ("blockNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_finalRecipient" ON "evm"."sponsored_oft_send" ("finalRecipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_originSender" ON "evm"."sponsored_oft_send" ("originSender") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_quoteNonce" ON "evm"."sponsored_oft_send" ("quoteNonce") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SponsoredOFTSend_chainId" ON "evm"."sponsored_oft_send" ("chainId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_SponsoredOFTSend_chainId"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredOFTSend_quoteNonce"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredOFTSend_originSender"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredOFTSend_finalRecipient"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SponsoredOFTSend_blockNumber"`,
    );
    await queryRunner.query(`DROP INDEX "evm"."IX_SponsoredOFTSend_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_SponsoredOFTSend_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."sponsored_oft_send"`);
  }
}
