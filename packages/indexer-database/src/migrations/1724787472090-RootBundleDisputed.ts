import { MigrationInterface, QueryRunner } from "typeorm";

export class RootBundleDisputed1724787472090 implements MigrationInterface {
  name = "RootBundleDisputed1724787472090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_disputed" (
          "id" SERIAL NOT NULL,
          "disputer" character varying NOT NULL,
          "requestTime" TIMESTAMP NOT NULL,
          "transactionHash" character varying NOT NULL,
          "transactionIndex" integer NOT NULL,
          "logIndex" integer NOT NULL,
          "blockNumber" integer NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UK_rootBundleDisputed_txHash" UNIQUE ("transactionHash"),
          CONSTRAINT "PK_93937e629b5c5c1471049bce3c4" PRIMARY KEY ("id")
        )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_disputed"`);
  }
}
