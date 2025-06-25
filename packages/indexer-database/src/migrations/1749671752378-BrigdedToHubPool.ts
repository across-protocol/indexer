import { MigrationInterface, QueryRunner } from "typeorm";

export class BrigdedToHubPool1749671752378 implements MigrationInterface {
  name = "BrigdedToHubPool1749671752378";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."bridged_to_hub_pool" (
      "id" SERIAL NOT NULL, "chainId" bigint NOT NULL,
      "amount" character varying NOT NULL,
      "l2TokenAddress" character varying NOT NULL,
      "transactionHash" character varying NOT NULL,
      "transactionIndex" integer NOT NULL,
      "logIndex" integer NOT NULL,
      "blockNumber" integer NOT NULL,
      "finalised" boolean NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UK_bridgedToHubPool_chain_block_txHash_logIndex" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
      CONSTRAINT "PK_8225cd322fbba7429edc5e80b6a" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."bridged_to_hub_pool"`);
  }
}
