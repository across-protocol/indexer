import { MigrationInterface, QueryRunner } from "typeorm";

export class RootBundleExecuted1724792616502 implements MigrationInterface {
  name = "RootBundleExecuted1724792616502";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_executed" (
          "id" SERIAL NOT NULL,
          "leafId" integer NOT NULL,
          "groupIndex" integer NOT NULL,
          "chainId" integer NOT NULL,
          "l1Tokens" jsonb NOT NULL,
          "bundleLpFees" jsonb NOT NULL,
          "netSendAmounts" jsonb NOT NULL,
          "runningBalances" jsonb NOT NULL,
          "caller" character varying NOT NULL,
          "transactionHash" character varying NOT NULL,
          "transactionIndex" integer NOT NULL,
          "logIndex" integer NOT NULL,
          "blockNumber" integer NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UK_rootBundleExecuted_chain_leaf_groupIdx_txHash" UNIQUE ("chainId", "leafId", "groupIndex", "transactionHash"),
          CONSTRAINT "PK_a3b0c39415b0b42afa7bd78075e" PRIMARY KEY ("id")
        )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_executed"`);
  }
}
