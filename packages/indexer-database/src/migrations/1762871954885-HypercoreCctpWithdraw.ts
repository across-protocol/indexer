import { MigrationInterface, QueryRunner } from "typeorm";

export class HypercoreCctpWithdraw1762871954885 implements MigrationInterface {
  name = "HypercoreCctpWithdraw1762871954885";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "hypercore_cctp_withdraw" (
            "id" SERIAL NOT NULL,
            "fromAddress" character varying NOT NULL,
            "hypercoreNonce" numeric NOT NULL,
            "originChainId" bigint NOT NULL,
            "destinationChainId" bigint NOT NULL,
            "versionId" integer NOT NULL,
            "declaredLength" integer NOT NULL,
            "magicBytes" character varying NOT NULL,
            "userData" character varying NOT NULL,
            "burnTxnHash" character varying,
            "mintTxnHash" character varying,
            "burnEventId" integer,
            "mintEventId" integer,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "UK_hypercoreCctpWithdraw_fromAddress_hypercoreNonce" UNIQUE ("fromAddress", "hypercoreNonce"),
            CONSTRAINT "REL_9d84ce07f5d7558a64ff2d56e3" UNIQUE ("burnEventId"),
            CONSTRAINT "REL_c36b10bfb54d6b3177c3f9cc9a" UNIQUE ("mintEventId"),
            CONSTRAINT "PK_bbe2eada815e0946e5f0866557b" PRIMARY KEY ("id"))
        `);
    await queryRunner.query(
      `CREATE INDEX "IX_hc_cctp_withdraw_burnTxHash" ON "hypercore_cctp_withdraw" ("burnTxnHash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "hypercore_cctp_withdraw" ADD CONSTRAINT "FK_hypercoreCctpWithdraw_burnEventId" FOREIGN KEY ("burnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "hypercore_cctp_withdraw" ADD CONSTRAINT "FK_hypercoreCctpWithdraw_mintEventId" FOREIGN KEY ("mintEventId") REFERENCES "evm"."message_received"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hypercore_cctp_withdraw" DROP CONSTRAINT "FK_hypercoreCctpWithdraw_mintEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hypercore_cctp_withdraw" DROP CONSTRAINT "FK_hypercoreCctpWithdraw_burnEventId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IX_hc_cctp_withdraw_burnTxHash"`,
    );
    await queryRunner.query(`DROP TABLE "hypercore_cctp_withdraw"`);
  }
}
