import { MigrationInterface, QueryRunner } from "typeorm";

export class Bundle1726085347385 implements MigrationInterface {
  name = "Bundle1726085347385";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bundle_status_enum" AS ENUM('Proposed', 'Validated', 'Canceled', 'Disputed', 'Executed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle" (
            "id" SERIAL NOT NULL, 
            "poolRebalanceRoot" character varying NOT NULL, 
            "relayerRefundRoot" character varying NOT NULL, 
            "slowRelayRoot" character varying NOT NULL, 
            "proposalId" integer NOT NULL, 
            "cancelationId" integer, 
            "disputeId" integer, 
            "status" "public"."bundle_status_enum" NOT NULL DEFAULT 'Proposed', 
            CONSTRAINT "REL_a8344aa79161a63b6397cc8006" UNIQUE ("proposalId"), 
            CONSTRAINT "REL_d728c78130d07f0857ca9d08f4" UNIQUE ("cancelationId"), 
            CONSTRAINT "REL_707430c410bc8a69af9432bedf" UNIQUE ("disputeId"), 
            CONSTRAINT "PK_637e3f87e837d6532109c198dea" PRIMARY KEY ("id")
        )`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_executions" (
            "bundleId" integer NOT NULL, 
            "executionId" integer NOT NULL, 
            CONSTRAINT "PK_d781edd9ee5d58baab40ec27585" PRIMARY KEY ("bundleId", "executionId")
        )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ac73eb154127e8d68b3a881e7" ON "bundle_executions" ("bundleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9551b3ed2ed4a9cf286637e51f" ON "bundle_executions" ("executionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleProposeId" FOREIGN KEY ("proposalId") REFERENCES "evm"."proposed_root_bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleCanceledId" FOREIGN KEY ("cancelationId") REFERENCES "evm"."root_bundle_canceled"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleDisputedId" FOREIGN KEY ("disputeId") REFERENCES "evm"."root_bundle_disputed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa" FOREIGN KEY ("executionId") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleDisputedId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleCanceledId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleProposeId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9551b3ed2ed4a9cf286637e51f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7ac73eb154127e8d68b3a881e7"`,
    );
    await queryRunner.query(`DROP TABLE "bundle_executions"`);
    await queryRunner.query(`DROP TABLE "bundle"`);
    await queryRunner.query(`DROP TYPE "public"."bundle_status_enum"`);
  }
}
