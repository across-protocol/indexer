import { MigrationInterface, QueryRunner } from "typeorm";

export class BundleEvents1729023124456 implements MigrationInterface {
  name = "BundleEvents1729023124456";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bundle_events_eventtype_enum" AS ENUM('deposit', 'expiredDeposit', 'fill', 'slowFill', 'unexecutableSlowFill')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_events" (
        "id" SERIAL NOT NULL,
        "bundleId" integer NOT NULL,
        "eventType" "public"."bundle_events_eventtype_enum" NOT NULL,
        "relayHash" character varying NOT NULL,
        "repaymentChainId" integer,
        CONSTRAINT "UK_bundleEvents_eventType_relayHash" UNIQUE ("eventType", "relayHash"),
        CONSTRAINT "PK_d0538e1e3372f423e85ac21f10d" PRIMARY KEY ("id"))
      `,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD "eventsAssociated" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_events" ADD CONSTRAINT "FK_4d3b911d6c2b431b2806b495285" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_events" DROP CONSTRAINT "FK_4d3b911d6c2b431b2806b495285"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP COLUMN "eventsAssociated"`,
    );
    await queryRunner.query(`DROP TABLE "bundle_events"`);
    await queryRunner.query(
      `DROP TYPE "public"."bundle_events_eventtype_enum"`,
    );
  }
}
