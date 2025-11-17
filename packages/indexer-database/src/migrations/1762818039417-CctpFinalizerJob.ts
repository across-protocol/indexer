import { MigrationInterface, QueryRunner } from "typeorm";

export class CctpFinalizerJob1762818039417 implements MigrationInterface {
  name = "CctpFinalizerJob1762818039417";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" DROP CONSTRAINT "FK_955f0780d44fb1b785425d7b567"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_blockTimestamp"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."oft_transfer_status_enum" AS ENUM('unfilled', 'filled', 'slowFillRequested', 'slowFilled', 'expired', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "oft_transfer" ("id" SERIAL NOT NULL, "guid" character varying NOT NULL, "originChainId" bigint NOT NULL, "destinationChainId" bigint NOT NULL, "originTokenAddress" character varying, "destinationTokenAddress" character varying, "originTokenAmount" numeric, "destinationTokenAmount" numeric, "originTxnRef" character varying, "destinationTxnRef" character varying, "oftSentEventId" integer, "oftReceivedEventId" integer, "status" "public"."oft_transfer_status_enum" NOT NULL DEFAULT 'unfilled', "bridgeFeeUsd" numeric, "originGasFee" numeric, "originGasFeeUsd" numeric, "originGasTokenPriceUsd" numeric, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_oft_transfer_guid" UNIQUE ("guid"), CONSTRAINT "REL_a55d2ab4103b4a13e824848b7d" UNIQUE ("oftSentEventId"), CONSTRAINT "REL_85a1fa5348947197b31809477c" UNIQUE ("oftReceivedEventId"), CONSTRAINT "PK_c986f173fc2315410daf73cfdde" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oft_transfer_status" ON "oft_transfer" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oft_transfer_origin_txn_ref" ON "oft_transfer" ("originTxnRef") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" ADD "sponsoredDepositForBurnId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "maxBpsToSponsor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "maxBpsToSponsor" bigint NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "maxUserSlippageBps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "maxUserSlippageBps" bigint NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" ALTER COLUMN "finalised" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_blockTimeStamp" ON "evm"."simple_transfer_flow_completed" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" ADD CONSTRAINT "FK_b91f805d79beb80d34596594576" FOREIGN KEY ("burnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" ADD CONSTRAINT "FK_a55d2ab4103b4a13e824848b7d4" FOREIGN KEY ("oftSentEventId") REFERENCES "evm"."oft_sent"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" ADD CONSTRAINT "FK_85a1fa5348947197b31809477c1" FOREIGN KEY ("oftReceivedEventId") REFERENCES "evm"."oft_received"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" DROP CONSTRAINT "FK_85a1fa5348947197b31809477c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" DROP CONSTRAINT "FK_a55d2ab4103b4a13e824848b7d4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" DROP CONSTRAINT "FK_b91f805d79beb80d34596594576"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_SimpleTransferFlowCompleted_blockTimeStamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ALTER COLUMN "finalised" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "maxUserSlippageBps"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "maxUserSlippageBps" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "maxBpsToSponsor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "maxBpsToSponsor" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" DROP COLUMN "sponsoredDepositForBurnId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IX_oft_transfer_origin_txn_ref"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IX_oft_transfer_status"`);
    await queryRunner.query(`DROP TABLE "oft_transfer"`);
    await queryRunner.query(`DROP TYPE "public"."oft_transfer_status_enum"`);
    await queryRunner.query(
      `CREATE INDEX "IX_SimpleTransferFlowCompleted_blockTimestamp" ON "evm"."simple_transfer_flow_completed" ("blockTimestamp") `,
    );
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" ADD CONSTRAINT "FK_955f0780d44fb1b785425d7b567" FOREIGN KEY ("burnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
