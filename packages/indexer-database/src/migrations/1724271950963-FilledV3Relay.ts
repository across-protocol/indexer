import { MigrationInterface, QueryRunner } from "typeorm";

export class FilledV3Relay1724271950963 implements MigrationInterface {
  name = "FilledV3Relay1724271950963";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fill"`);
    await queryRunner.query(`DROP TYPE "public"."fill_filltype_enum"`);
    await queryRunner.query(
      `CREATE TYPE "evm"."filled_v3_relay_filltype_enum" AS ENUM('0', '1', '2')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."filled_v3_relay" (
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
                "fillType" "evm"."filled_v3_relay_filltype_enum" NOT NULL,
                CONSTRAINT "UK_filledV3Relay_uuid" UNIQUE ("uuid"),
                CONSTRAINT "PK_8f1cc6f89a5ed042e3ed258d400" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."filled_v3_relay"`);
    await queryRunner.query(`DROP TYPE "evm"."filled_v3_relay_filltype_enum"`);
  }
}
