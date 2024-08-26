import { MigrationInterface, QueryRunner } from "typeorm";

export class RequestedV3SlowFill1724272032851 implements MigrationInterface {
  name = "RequestedV3SlowFill1724272032851";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "slow_fill_request"`);
    await queryRunner.query(
      `CREATE TABLE "evm"."requested_v3_slow_fill" (
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
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_requestedV3SlowFill_uuid" UNIQUE ("uuid"),
                CONSTRAINT "PK_ef6d61ccd9e937b8a798ad82d3c" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."requested_v3_slow_fill"`);
  }
}
