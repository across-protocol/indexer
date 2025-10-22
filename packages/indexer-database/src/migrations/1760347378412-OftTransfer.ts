import { MigrationInterface, QueryRunner } from "typeorm";

export class OftTransfer1760347378412 implements MigrationInterface {
  name = "OftTransfer1760347378412";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."oft_transfer_status_enum" AS ENUM(
          'unfilled',
          'filled'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "oft_transfer" (
          "id" SERIAL NOT NULL,
          "guid" character varying NOT NULL,
          "originChainId" bigint NOT NULL,
          "destinationChainId" bigint NOT NULL,
          "originTokenAddress" character varying,
          "destinationTokenAddress" character varying,
          "originTokenAmount" numeric,
          "destinationTokenAmount" numeric,
          "originTxnRef" character varying,
          "destinationTxnRef" character varying,
          "oftSentEventId" integer,
          "oftReceivedEventId" integer,
          "status" "public"."oft_transfer_status_enum" NOT NULL DEFAULT 'unfilled',
          "bridgeFeeUsd" numeric,
          "originGasFee" numeric,
          "originGasFeeUsd" numeric,
          "originGasTokenPriceUsd" numeric,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "REL_a55d2ab4103b4a13e824848b7d" UNIQUE ("oftSentEventId"),
          CONSTRAINT "REL_85a1fa5348947197b31809477c" UNIQUE ("oftReceivedEventId"),
          CONSTRAINT "PK_c986f173fc2315410daf73cfdde" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
        ALTER TABLE "oft_transfer" 
        ADD CONSTRAINT "FK_a55d2ab4103b4a13e824848b7d4" 
        FOREIGN KEY ("oftSentEventId") REFERENCES "evm"."oft_sent"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
        ALTER TABLE "oft_transfer" 
        ADD CONSTRAINT "FK_85a1fa5348947197b31809477c1" 
        FOREIGN KEY ("oftReceivedEventId") REFERENCES "evm"."oft_received"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" DROP CONSTRAINT "FK_85a1fa5348947197b31809477c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "oft_transfer" DROP CONSTRAINT "FK_a55d2ab4103b4a13e824848b7d4"`,
    );
    await queryRunner.query(`DROP TABLE "oft_transfer"`);
    await queryRunner.query(`DROP TYPE "public"."oft_transfer_status_enum"`);
  }
}
