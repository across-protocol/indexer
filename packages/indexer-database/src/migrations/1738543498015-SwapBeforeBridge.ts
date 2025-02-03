import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapBeforeBridge1738543498015 implements MigrationInterface {
  name = "SwapBeforeBridge1738543498015";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evm"."swap_before_bridge" (
        "id" SERIAL NOT NULL, 
        "swapToken" character varying NOT NULL, 
        "acrossInputToken" character varying NOT NULL, 
        "acrossOutputToken" character varying NOT NULL, 
        "swapTokenAmount" numeric NOT NULL, 
        "acrossInputAmount" numeric NOT NULL, 
        "acrossOutputAmount" numeric NOT NULL, 
        "exchange" character varying NOT NULL, 
        "blockHash" character varying NOT NULL, 
        "blockNumber" integer NOT NULL, 
        "transactionHash" character varying NOT NULL, 
        "logIndex" integer NOT NULL, 
        "chainId" integer NOT NULL, 
        "finalised" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
        CONSTRAINT "UK_swapBeforeBridge_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"), 
        CONSTRAINT "PK_4d800cfe04c9c412fb76e62e21f" PRIMARY KEY ("id"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."swap_before_bridge"`);
  }
}
