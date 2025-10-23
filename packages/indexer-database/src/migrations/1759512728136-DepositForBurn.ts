import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositForBurn1759512728136 implements MigrationInterface {
  name = "DepositForBurn1759512728136";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."deposit_for_burn" (
        "id" SERIAL NOT NULL,
        "burnToken" character varying NOT NULL,
        "amount" decimal NOT NULL,
        "depositor" character varying NOT NULL,
        "mintRecipient" character varying NOT NULL,
        "destinationDomain" integer NOT NULL,
        "destinationTokenMessenger" character varying NOT NULL,
        "destinationCaller" character varying NOT NULL,
        "maxFee" decimal NOT NULL,
        "minFinalityThreshold" integer NOT NULL,
        "hookData" character varying NOT NULL,
        "chainId" bigint NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "blockTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_depositForBurn_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_c10070e785ad9de4c63e4e420ee" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_depositForBurn_deletedAt" ON "evm"."deposit_for_burn" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_depositForBurn_finalised" ON "evm"."deposit_for_burn" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_depositForBurn_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_depositForBurn_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."deposit_for_burn"`);
  }
}
