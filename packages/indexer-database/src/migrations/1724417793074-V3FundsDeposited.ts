import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1724417793074 implements MigrationInterface {
  name = "V3FundsDeposited1724417793074";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."v3_funds_deposited" (
                "id" SERIAL NOT NULL,
                "relayHash" character varying NOT NULL,
                "depositId" integer NOT NULL,
                "originChainId" integer NOT NULL,
                "destinationChainId" integer NOT NULL,
                "fromLiteChain" boolean NOT NULL,
                "toLiteChain" boolean NOT NULL,
                "depositor" character varying NOT NULL,
                "recipient" character varying NOT NULL,
                "inputToken" character varying NOT NULL,
                "inputAmount" character varying NOT NULL,
                "outputToken" character varying NOT NULL,
                "outputAmount" character varying NOT NULL,
                "message" character varying NOT NULL,
                "exclusiveRelayer" character varying NOT NULL,
                "exclusivityDeadline" TIMESTAMP,
                "fillDeadline" TIMESTAMP NOT NULL,
                "quoteTimestamp" TIMESTAMP NOT NULL,
                "quoteBlockNumber" integer NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_v3FundsDeposited_depositId_originChainId" UNIQUE ("depositId", "originChainId"),
                CONSTRAINT "PK_7fb4637d005c1caba823aefdbd1" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."v3_funds_deposited"`);
  }
}
