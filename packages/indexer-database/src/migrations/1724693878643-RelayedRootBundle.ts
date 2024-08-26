import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayedRootBundle1724693878643 implements MigrationInterface {
  name = "RelayedRootBundle1724693878643";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."relayed_root_bundle" (
                "id" SERIAL NOT NULL,
                "chainId" integer NOT NULL,
                "rootBundleId" integer NOT NULL,
                "relayerRefundRoot" character varying NOT NULL,
                "slowRelayRoot" character varying NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_relayedRootBundle_chainId_rootBundleId" UNIQUE ("chainId", "rootBundleId"),
                CONSTRAINT "PK_b95beeb64004ee791b2195aaa80" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."relayed_root_bundle"`);
  }
}
