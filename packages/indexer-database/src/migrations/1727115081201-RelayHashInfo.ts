import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1727115081201 implements MigrationInterface {
  name = "RelayHashInfo1727115081201";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7ac73eb154127e8d68b3a881e7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9551b3ed2ed4a9cf286637e51f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "depositTxHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "fillTxHash" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ac73eb154127e8d68b3a881e7" ON "bundle_executions" ("bundleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9551b3ed2ed4a9cf286637e51f" ON "bundle_executions" ("executionId") `,
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
      `DROP INDEX "public"."IDX_9551b3ed2ed4a9cf286637e51f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7ac73eb154127e8d68b3a881e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "fillTxHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "depositTxHash"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9551b3ed2ed4a9cf286637e51f" ON "bundle_executions" ("executionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ac73eb154127e8d68b3a881e7" ON "bundle_executions" ("bundleId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa" FOREIGN KEY ("executionId") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }
}
