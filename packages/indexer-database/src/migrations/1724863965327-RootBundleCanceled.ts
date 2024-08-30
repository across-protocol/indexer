import { MigrationInterface, QueryRunner } from "typeorm";

export class RootBundleCanceled1724863965327 implements MigrationInterface {
  name = "RootBundleCanceled1724863965327";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_canceled" (
                "id" SERIAL NOT NULL,
                "caller" character varying NOT NULL,
                "requestTime" TIMESTAMP NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_rootBundleCanceled_txHash" UNIQUE ("transactionHash"),
                CONSTRAINT "PK_97a84a7224c26da0f0d5dc24b6a" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_canceled"`);
  }
}
