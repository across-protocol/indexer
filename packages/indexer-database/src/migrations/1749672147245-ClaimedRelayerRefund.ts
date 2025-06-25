import { MigrationInterface, QueryRunner } from "typeorm";

export class ClaimedRelayerRefund1749672147245 implements MigrationInterface {
  name = "ClaimedRelayerRefund1749672147245";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."claimed_relayer_refunds" (
      "id" SERIAL NOT NULL, "chainId" bigint NOT NULL,
      "l2TokenAddress" character varying NOT NULL,
      "refundAddress" character varying NOT NULL,
      "amount" character varying NOT NULL,
      "caller" character varying NOT NULL,
      "transactionHash" character varying NOT NULL,
      "transactionIndex" integer NOT NULL,
      "logIndex" integer NOT NULL,
      "blockNumber" integer NOT NULL,
      "finalised" boolean NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UK_claimedRelayerRefunds_chain_block_tx_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
      CONSTRAINT "PK_43fe8759f55c08fa596a32bbd3f" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."claimed_relayer_refunds"`);
  }
}
