import { MigrationInterface, QueryRunner } from "typeorm";

export class IndexerProgressInfo1737589453070 implements MigrationInterface {
  name = "IndexerProgressInfo1737589453070";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "indexer_progress_info" (
        "id" character varying NOT NULL, 
        "lastFinalisedBlock" integer NOT NULL, 
        "latestBlockNumber" integer NOT NULL, 
        "isBackfilling" boolean NOT NULL, 
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), 
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
        CONSTRAINT "PK_7c077a22af710355c7d83c00096" PRIMARY KEY ("id"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "indexer_progress_info"`);
  }
}
