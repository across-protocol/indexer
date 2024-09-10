import { MigrationInterface, QueryRunner } from "typeorm";

export class Bundle1725910210791 implements MigrationInterface {
  name = "Bundle1725910210791";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "aggregate"."bundle_status_enum" AS ENUM('Proposed', 'Validated', 'Canceled', 'Disputed', 'Executed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "aggregate"."bundle" ("id" SERIAL NOT NULL, "poolRebalanceRoot" character varying NOT NULL, "relayerRefundRoot" character varying NOT NULL, "slowRelayRoot" character varying NOT NULL, "status" "aggregate"."bundle_status_enum" NOT NULL, "proposalId" integer, "cancellationId" integer, "executionId" integer, "disputeId" integer, CONSTRAINT "REL_a8344aa79161a63b6397cc8006" UNIQUE ("proposalId"), CONSTRAINT "REL_0b9be31e1e95d2f01f834b6509" UNIQUE ("cancellationId"), CONSTRAINT "REL_830aeee2e34ac04c5d5a604046" UNIQUE ("executionId"), CONSTRAINT "REL_707430c410bc8a69af9432bedf" UNIQUE ("disputeId"), CONSTRAINT "PK_637e3f87e837d6532109c198dea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleProposeId" FOREIGN KEY ("proposalId") REFERENCES "evm"."proposed_root_bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleCanceledId" FOREIGN KEY ("cancellationId") REFERENCES "evm"."root_bundle_canceled"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleExecutedId" FOREIGN KEY ("executionId") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleDisputedId" FOREIGN KEY ("disputeId") REFERENCES "evm"."root_bundle_disputed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleDisputedId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleExecutedId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleCanceledId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleProposeId"`,
    );
    await queryRunner.query(`DROP TABLE "aggregate"."bundle"`);
    await queryRunner.query(`DROP TYPE "aggregate"."bundle_status_enum"`);
  }
}
