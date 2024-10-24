import { MigrationInterface, QueryRunner } from "typeorm";

export class BundleEvent1729644581993 implements MigrationInterface {
  name = "BundleEvent1729644581993";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bundle_event_type_enum" AS ENUM('deposit', 'expiredDeposit', 'fill', 'slowFill', 'unexecutableSlowFill')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_event" (
        "id" SERIAL NOT NULL,
        "bundleId" integer NOT NULL,
        "type" "public"."bundle_event_type_enum" NOT NULL,
        "relayHash" character varying NOT NULL,
        "repaymentChainId" integer,
        CONSTRAINT "UK_bundleEvent_eventType_relayHash" UNIQUE ("type", "relayHash"),
        CONSTRAINT "PK_d633122fa4b52768e1b588bddee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD "eventsAssociated" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD CONSTRAINT "FK_62dcd4f6f0d1713fab0c8542dba" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP CONSTRAINT "FK_62dcd4f6f0d1713fab0c8542dba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP COLUMN "eventsAssociated"`,
    );
    await queryRunner.query(`DROP TABLE "bundle_event"`);
    await queryRunner.query(`DROP TYPE "public"."bundle_event_type_enum"`);
  }
}
