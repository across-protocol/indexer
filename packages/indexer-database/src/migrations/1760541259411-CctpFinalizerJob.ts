import { MigrationInterface, QueryRunner } from "typeorm";

export class CctpFinalizerJob1760541259411 implements MigrationInterface {
  name = "CctpFinalizerJob1760541259411";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cctp_finalizer_job" (
        "id" SERIAL NOT NULL,
        "attestation" character varying NOT NULL,
        "message" character varying NOT NULL,
        "burnEventId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "REL_955f0780d44fb1b785425d7b56" UNIQUE ("burnEventId"),
        CONSTRAINT "PK_f6a74f608a35916f58fbb1da6ba" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" ADD CONSTRAINT "FK_955f0780d44fb1b785425d7b567" FOREIGN KEY ("burnEventId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cctp_finalizer_job" DROP CONSTRAINT "FK_955f0780d44fb1b785425d7b567"`,
    );
    await queryRunner.query(`DROP TABLE "cctp_finalizer_job"`);
  }
}
