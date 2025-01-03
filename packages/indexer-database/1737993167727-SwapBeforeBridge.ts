import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapBeforeBridge1737993167727 implements MigrationInterface {
    name = 'SwapBeforeBridge1737993167727'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "evm"."swap_before_bridge_event" ("id" SERIAL NOT NULL, "swapToken" character varying NOT NULL, "acrossInputToken" character varying NOT NULL, "acrossOutputToken" character varying NOT NULL, "swapTokenAmount" numeric NOT NULL, "acrossInputAmount" numeric NOT NULL, "acrossOutputAmount" numeric NOT NULL, "blockHash" character varying NOT NULL, "transactionHash" character varying NOT NULL, "logIndex" integer NOT NULL, "originChainId" integer NOT NULL, "depositId" integer NOT NULL, "depositEventId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_swapBeforeBridgeEvent_originChainId_blockHash_txHash_logIndex" UNIQUE ("originChainId", "blockHash", "transactionHash", "logIndex"), CONSTRAINT "PK_def3e941c5f195c577c4ca7dc1c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" ADD "swapFeeInputAmount" numeric`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" ADD "swapFeeUsdAmount" numeric`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" ADD "swapInputTokenName" character varying`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" ADD "swapOutputTokenName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "relay_hash_info" DROP COLUMN "swapOutputTokenName"`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" DROP COLUMN "swapInputTokenName"`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" DROP COLUMN "swapFeeUsdAmount"`);
        await queryRunner.query(`ALTER TABLE "relay_hash_info" DROP COLUMN "swapFeeInputAmount"`);
        await queryRunner.query(`DROP TABLE "evm"."swap_before_bridge_event"`);
    }

}
