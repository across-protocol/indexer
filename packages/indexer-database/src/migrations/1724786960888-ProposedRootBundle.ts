import { MigrationInterface, QueryRunner } from "typeorm";

export class ProposedRootBundle1724786960888 implements MigrationInterface {
  name = "ProposedRootBundle1724786960888";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."proposed_root_bundle" (
          "id" SERIAL NOT NULL,
          "challengePeriodEndTimestamp" TIMESTAMP NOT NULL,
          "poolRebalanceLeafCount" integer NOT NULL,
          "bundleEvaluationBlockNumbers" jsonb NOT NULL,
          "poolRebalanceRoot" character varying NOT NULL,
          "relayerRefundRoot" character varying NOT NULL,
          "slowRelayRoot" character varying NOT NULL,
          "proposer" character varying NOT NULL,
          "transactionHash" character varying NOT NULL,
          "transactionIndex" integer NOT NULL,
          "logIndex" integer NOT NULL,
          "blockNumber" integer NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UK_proposedRootBundle_txHash" UNIQUE ("transactionHash"),
          CONSTRAINT "PK_61f8cd3411bf1976fdb13dca607" PRIMARY KEY ("id")
        )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."proposed_root_bundle"`);
  }
}
