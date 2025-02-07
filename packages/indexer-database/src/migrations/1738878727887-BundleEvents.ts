import { MigrationInterface, QueryRunner } from "typeorm";

export class BundleEvents1738878727887 implements MigrationInterface {
  name = "BundleEvents1738878727887";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP CONSTRAINT "UK_bundleEvent_eventType_relayHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD "eventChainId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD "eventBlockNumber" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD "eventLogIndex" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP COLUMN "eventLogIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP COLUMN "eventBlockNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP COLUMN "eventChainId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD CONSTRAINT "UK_bundleEvent_eventType_relayHash" UNIQUE ("type", "relayHash")`,
    );
  }
}
