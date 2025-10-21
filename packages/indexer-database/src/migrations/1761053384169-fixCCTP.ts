import { MigrationInterface, QueryRunner } from "typeorm";

export class FixCCTP1761053384169 implements MigrationInterface {
  name = "FixCCTP1761053384169";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" DROP CONSTRAINT "UK_depositForBurn_chainId_blockHash_logIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" DROP CONSTRAINT "UK_messageSent_chainId_blockHash_logIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" DROP CONSTRAINT "UK_mintAndWithdraw_chainId_blockHash_logIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" DROP CONSTRAINT "UK_messageReceived_chainId_blockHash_logIndex"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" DROP COLUMN "blockHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" DROP COLUMN "blockHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" DROP COLUMN "blockHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" DROP COLUMN "blockHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" ADD CONSTRAINT "UK_depositForBurn_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" ADD CONSTRAINT "UK_messageSent_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" ADD CONSTRAINT "UK_mintAndWithdraw_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" ADD CONSTRAINT "UK_messageReceived_chain_block_txn_log" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" DROP CONSTRAINT "UK_messageReceived_chain_block_txn_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" DROP CONSTRAINT "UK_mintAndWithdraw_chain_block_txn_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" DROP CONSTRAINT "UK_messageSent_chain_block_txn_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" DROP CONSTRAINT "UK_depositForBurn_chain_block_txn_log"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" ADD "blockHash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" ADD "blockHash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" ADD "blockHash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" ADD "blockHash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" ADD CONSTRAINT "UK_messageReceived_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" ADD CONSTRAINT "UK_mintAndWithdraw_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" ADD CONSTRAINT "UK_messageSent_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" ADD CONSTRAINT "UK_depositForBurn_chainId_blockHash_logIndex" UNIQUE ("chainId", "blockHash", "logIndex")`,
    );
  }
}
