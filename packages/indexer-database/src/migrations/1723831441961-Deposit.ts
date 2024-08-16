import { MigrationInterface, QueryRunner } from "typeorm";

export class Deposit1723831441961 implements MigrationInterface {
  name = "Deposit1723831441961";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "deposit" (
                "id" SERIAL NOT NULL,
                "uuid" character varying NOT NULL,
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
                "status" character varying NOT NULL DEFAULT 'unfilled',
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_deposit_depositId_originChainId" UNIQUE ("depositId", "originChainId"),
                CONSTRAINT "PK_6654b4be449dadfd9d03a324b61" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deposit"`);
  }
}
