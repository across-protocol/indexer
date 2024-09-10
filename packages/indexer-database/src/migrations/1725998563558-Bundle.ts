import { MigrationInterface, QueryRunner } from "typeorm";

export class Bundle1725998563558 implements MigrationInterface {
  name = "Bundle1725998563558";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleExecutedId"`,
    );
    await queryRunner.query(
      `CREATE TABLE "aggregate"."bundle_executions_join" ("bundle_id" integer NOT NULL, "execution_id" integer NOT NULL, CONSTRAINT "PK_44de9a281940ad0cd859aab7e87" PRIMARY KEY ("bundle_id", "execution_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6589c7f2baeb3c5d0a4a03cdeb" ON "aggregate"."bundle_executions_join" ("bundle_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c8d2fc6c45293f981dc039a3ef" ON "aggregate"."bundle_executions_join" ("execution_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "REL_0b9be31e1e95d2f01f834b6509"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP COLUMN "cancellationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "REL_830aeee2e34ac04c5d5a604046"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP COLUMN "executionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD "cancelationId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "UQ_d728c78130d07f0857ca9d08f41" UNIQUE ("cancelationId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleProposeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ALTER COLUMN "proposalId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleProposeId" FOREIGN KEY ("proposalId") REFERENCES "evm"."proposed_root_bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle_executions_join" ADD CONSTRAINT "FK_6589c7f2baeb3c5d0a4a03cdeb1" FOREIGN KEY ("bundle_id") REFERENCES "aggregate"."bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle_executions_join" ADD CONSTRAINT "FK_c8d2fc6c45293f981dc039a3ef1" FOREIGN KEY ("execution_id") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle_executions_join" DROP CONSTRAINT "FK_c8d2fc6c45293f981dc039a3ef1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle_executions_join" DROP CONSTRAINT "FK_6589c7f2baeb3c5d0a4a03cdeb1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "FK_bundle_rootBundleProposeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ALTER COLUMN "proposalId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleProposeId" FOREIGN KEY ("proposalId") REFERENCES "evm"."proposed_root_bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP CONSTRAINT "UQ_d728c78130d07f0857ca9d08f41"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" DROP COLUMN "cancelationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD "executionId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "REL_830aeee2e34ac04c5d5a604046" UNIQUE ("executionId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD "cancellationId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "REL_0b9be31e1e95d2f01f834b6509" UNIQUE ("cancellationId")`,
    );
    await queryRunner.query(
      `DROP INDEX "aggregate"."IDX_c8d2fc6c45293f981dc039a3ef"`,
    );
    await queryRunner.query(
      `DROP INDEX "aggregate"."IDX_6589c7f2baeb3c5d0a4a03cdeb"`,
    );
    await queryRunner.query(`DROP TABLE "aggregate"."bundle_executions_join"`);
    await queryRunner.query(
      `ALTER TABLE "aggregate"."bundle" ADD CONSTRAINT "FK_bundle_rootBundleExecutedId" FOREIGN KEY ("executionId") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
