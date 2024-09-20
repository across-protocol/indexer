import { MigrationInterface, QueryRunner } from "typeorm";

export class BundleBlockRange1726523435568 implements MigrationInterface {
  name = "Bundle1726523435568";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bundle_block_range" (
            "id" SERIAL NOT NULL, 
            "bundleId" integer NOT NULL, 
            "chainId" integer NOT NULL, 
            "startBlock" integer NOT NULL, 
            "endBlock" integer NOT NULL, 
            CONSTRAINT "UK_bundleBlockRange_bundleId_chainId" UNIQUE ("bundleId", "chainId"), 
            CONSTRAINT "PK_903331c592ac44aaf237755fd8b" PRIMARY KEY ("id")
        )`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" ADD CONSTRAINT "FK_f5c43af2e3e71193090d4f37285" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" DROP CONSTRAINT "FK_f5c43af2e3e71193090d4f37285"`,
    );
    await queryRunner.query(`DROP TABLE "bundle_block_range"`);
  }
}
