import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapBeforeBridge1739967812685 implements MigrationInterface {
  name = "SwapBeforeBridge1739967812685";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "evm"."swap_before_bridge" (
      "id" SERIAL NOT NULL, 
      "swapToken" character varying NOT NULL, 
      "acrossInputToken" character varying NOT NULL, 
      "acrossOutputToken" character varying NOT NULL, 
      "swapTokenAmount" numeric NOT NULL, 
      "acrossInputAmount" numeric NOT NULL, 
      "acrossOutputAmount" numeric NOT NULL, 
      "exchange" character varying NOT NULL, 
      "blockHash" character varying NOT NULL, 
      "blockNumber" integer NOT NULL, 
      "transactionHash" character varying NOT NULL, 
      "logIndex" integer NOT NULL, 
      "chainId" integer NOT NULL, 
      "finalised" boolean NOT NULL, 
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
      "deletedAt" TIMESTAMP, 
      CONSTRAINT "UK_swapBeforeBridge_blockNumber_chainId_logIndex" UNIQUE ("blockNumber", "chainId", "logIndex"), 
      CONSTRAINT "PK_4d800cfe04c9c412fb76e62e21f" PRIMARY KEY ("id"))
  `);
    await queryRunner.query(
      `CREATE INDEX "IX_swapBeforeBridge_deletedAt" ON "evm"."swap_before_bridge" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapBeforeBridge_finalised" ON "evm"."swap_before_bridge" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_swapBeforeBridge_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_swapBeforeBridge_deletedAt"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_swapBeforeBridge_blockNumber"`,
    );
    await queryRunner.query(`DROP TABLE "evm"."swap_before_bridge"`);
  }
}
