import { MigrationInterface, QueryRunner } from "typeorm";

export class Fill1723753878289 implements MigrationInterface {
  name = "Fill1723753878289";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "fill" (
                "id" SERIAL NOT NULL,
                "uuid" character varying NOT NULL,
                "depositId" integer NOT NULL,
                "originChainId" integer NOT NULL,
                "destinationChainId" integer NOT NULL,
                "depositor" character varying NOT NULL,
                "recipient" character varying NOT NULL,
                "inputToken" character varying NOT NULL,
                "inputAmount" numeric NOT NULL,
                "outputToken" character varying NOT NULL,
                "outputAmount" numeric NOT NULL,
                "message" character varying NOT NULL,
                "exclusiveRelayer" character varying NOT NULL,
                "exclusivityDeadline" TIMESTAMP,
                "fillDeadline" TIMESTAMP NOT NULL,
                "isValid" boolean,
                "relayer" character varying NOT NULL,
                "repaymentChainId" integer NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedRecipient" character varying NOT NULL,
                "updatedMessage" character varying NOT NULL,
                "updatedOutputAmount" numeric NOT NULL,
                "fillType" "public"."fill_filltype_enum" NOT NULL,
                CONSTRAINT "UK_fill_uuid_transactionHash_logIndex" UNIQUE ("uuid", "transactionHash", "logIndex"),
                CONSTRAINT "PK_27c68239b5271f170cfe8946cc1" PRIMARY KEY ("id")
            )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fill"`);
  }
}
