import { MigrationInterface, QueryRunner } from "typeorm";

export class SetPoolRebalanceRoot1727299133735 implements MigrationInterface {
  name = "SetPoolRebalanceRoot1727299133735";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."set_pool_rebalance_root" (
        "id" SERIAL NOT NULL, 
        "destinationChainId" integer NOT NULL, 
        "l1Token" character varying NOT NULL, 
        "destinationToken" character varying NOT NULL, 
        "blockNumber" integer NOT NULL, 
        "transactionHash" character varying, 
        "transactionIndex" integer, 
        "logIndex" integer, 
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
        CONSTRAINT "PK_eaf002832bc6c5d1063be0d1da5" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."set_pool_rebalance_root"`);
  }
}
