import { MigrationInterface, QueryRunner } from "typeorm";

export class Fill1724097383862 implements MigrationInterface {
  name = "Fill1724097383862";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."fill_filltype_enum" AS ENUM('0', '1', '2')`,
    );
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
                "inputAmount" character varying NOT NULL,
                "outputToken" character varying NOT NULL,
                "outputAmount" character varying NOT NULL,
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
                "updatedOutputAmount" character varying NOT NULL,
                "fillType" "public"."fill_filltype_enum" NOT NULL,
                CONSTRAINT "UK_fill_uuid" UNIQUE ("uuid"),
                CONSTRAINT "PK_27c68239b5271f170cfe8946cc1" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fill"`);
    await queryRunner.query(`DROP TYPE "public"."fill_filltype_enum"`);
  }
}
