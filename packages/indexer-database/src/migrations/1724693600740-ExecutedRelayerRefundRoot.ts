import { MigrationInterface, QueryRunner } from "typeorm";

export class ExecutedRelayerRefundRoot1724693600740
  implements MigrationInterface
{
  name = "ExecutedRelayerRefundRoot1724693600740";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."executed_relayer_refund_root" (
                "id" SERIAL NOT NULL,
                "chainId" integer NOT NULL,
                "rootBundleId" integer NOT NULL,
                "leafId" integer NOT NULL,
                "l2TokenAddress" character varying NOT NULL,
                "amountToReturn" character varying NOT NULL,
                "refundAmounts" jsonb NOT NULL,
                "refundAddresses" jsonb NOT NULL,
                "caller" character varying NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_executedRelayerRefundRoot_chain_rootBundle_leaf" UNIQUE ("chainId", "rootBundleId", "leafId"),
                CONSTRAINT "PK_9785720b5a11005f37d894fd412" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."executed_relayer_refund_root"`);
  }
}
