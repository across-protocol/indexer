import { MigrationInterface, QueryRunner } from "typeorm";

export class RequestedSpeedUpV3Deposit1725046769853
  implements MigrationInterface
{
  name = "RequestedSpeedUpV3Deposit1725046769853";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."requested_speed_up_v3_deposit" (
                "id" SERIAL NOT NULL,
                "originChainId" integer NOT NULL,
                "depositId" integer NOT NULL,
                "depositor" character varying NOT NULL,
                "updatedRecipient" character varying NOT NULL,
                "updatedMessage" character varying NOT NULL,
                "updatedOutputAmount" character varying NOT NULL,
                "depositorSignature" character varying NOT NULL,
                "transactionHash" character varying NOT NULL,
                "transactionIndex" integer NOT NULL,
                "logIndex" integer NOT NULL,
                "blockNumber" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UK_requestedSpeedUpV3_depositId_originChain_txHash" UNIQUE ("depositId", "originChainId", "transactionHash"),
                CONSTRAINT "PK_92225be4f84268c26a66b4eaa17" PRIMARY KEY ("id")
            )
        `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."requested_speed_up_v3_deposit"`);
  }
}
