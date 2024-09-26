import { MigrationInterface, QueryRunner } from "typeorm";

export class SetPoolRebalanceRoute1727374473839 implements MigrationInterface {
  name = "SetPoolRebalanceRoute1727374473839";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."set_pool_rebalance_route" (
            "id" SERIAL NOT NULL, 
            "destinationChainId" integer NOT NULL, 
            "l1Token" character varying NOT NULL, 
            "destinationToken" character varying NOT NULL, 
            "blockNumber" integer NOT NULL, 
            "transactionHash" character varying NOT NULL, 
            "transactionIndex" integer NOT NULL, 
            "logIndex" integer NOT NULL, 
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "UK_setPoolRebalanceRoute_transactionHash_transactionIndex_logIndex" UNIQUE ("transactionHash", "transactionIndex", "logIndex"), 
            CONSTRAINT "PK_93edcf0d94f29e5cd34513baf9d" PRIMARY KEY ("id")
        )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."set_pool_rebalance_route"`);
  }
}
