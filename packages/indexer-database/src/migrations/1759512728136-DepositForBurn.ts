import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositForBurn1759512728136 implements MigrationInterface {
  name = "DepositForBurn1759512728136";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."deposit_for_burn" ("id" SERIAL NOT NULL, "burnToken" character varying NOT NULL, "amount" bigint NOT NULL, "depositor" character varying NOT NULL, "mintRecipient" character varying NOT NULL, "destinationDomain" integer NOT NULL, "destinationTokenMessenger" character varying NOT NULL, "destinationCaller" character varying NOT NULL, "maxFee" bigint NOT NULL, "minFinalityThreshold" integer NOT NULL, "hookData" character varying NOT NULL, "chainId" bigint NOT NULL, "blockHash" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "blockTimestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UK_depositForBurn_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"), CONSTRAINT "PK_c10070e785ad9de4c63e4e420ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_depositForBurn_deletedAt" ON "evm"."deposit_for_burn" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_depositForBurn_finalised" ON "evm"."deposit_for_burn" ("finalised") `,
    );

    await queryRunner.query(
      `CREATE TABLE "evm"."message_sent" ("id" SERIAL NOT NULL, "message" character varying NOT NULL, "version" integer NOT NULL, "sourceDomain" integer NOT NULL, "destinationDomain" integer NOT NULL, "nonce" character varying NOT NULL, "sender" character varying NOT NULL, "recipient" character varying NOT NULL, "destinationCaller" character varying NOT NULL, "minFinalityThreshold" integer NOT NULL, "finalityThresholdExecuted" integer NOT NULL, "messageBody" character varying NOT NULL, "chainId" bigint NOT NULL, "blockHash" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "blockTimestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UK_messageSent_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"), CONSTRAINT "PK_8b1b9e0af3eac42a29879166fbb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageSent_deletedAt" ON "evm"."message_sent" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageSent_finalised" ON "evm"."message_sent" ("finalised") `,
    );

    await queryRunner.query(
      `CREATE TABLE "evm"."mint_and_withdraw" ("id" SERIAL NOT NULL, "mintRecipient" character varying NOT NULL, "amount" bigint NOT NULL, "mintToken" character varying NOT NULL, "feeCollected" bigint NOT NULL, "chainId" bigint NOT NULL, "blockHash" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "blockTimestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UK_mintAndWithdraw_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"), CONSTRAINT "PK_2af62c40bf853fe4063706d2034" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mintAndWithdraw_deletedAt" ON "evm"."mint_and_withdraw" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mintAndWithdraw_finalised" ON "evm"."mint_and_withdraw" ("finalised") `,
    );

    await queryRunner.query(
      `CREATE TABLE "evm"."message_received" ("id" SERIAL NOT NULL, "caller" character varying NOT NULL, "sourceDomain" integer NOT NULL, "nonce" character varying NOT NULL, "sender" character varying NOT NULL, "finalityThresholdExecuted" integer NOT NULL, "messageBody" character varying NOT NULL, "chainId" bigint NOT NULL, "blockHash" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "blockTimestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UK_messageReceived_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex"), CONSTRAINT "PK_de337d8e9174f97ff01ac04fbaa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageReceived_deletedAt" ON "evm"."message_received" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_messageReceived_finalised" ON "evm"."message_received" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_messageReceived_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_messageReceived_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."message_received"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_mintAndWithdraw_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_mintAndWithdraw_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."mint_and_withdraw"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_messageSent_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_messageSent_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."message_sent"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_depositForBurn_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_depositForBurn_deletedAt"`);
    await queryRunner.query(`DROP TABLE "evm"."deposit_for_burn"`);
  }
}
