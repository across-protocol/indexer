import { MigrationInterface, QueryRunner } from "typeorm";

export class GaslessDeposit1768260000000 implements MigrationInterface {
  name = "GaslessDeposit1768260000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gasless_deposit" (
        "id" SERIAL NOT NULL,
        "originChainId" character varying NOT NULL,
        "destinationChainId" character varying NOT NULL,
        "depositId" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UK_gaslessDeposit_originChainId_depositId" UNIQUE ("originChainId", "depositId"),
        CONSTRAINT "PK_gasless_deposit" PRIMARY KEY ("id"))
    `);

    await queryRunner.query(
      `CREATE INDEX "IX_gaslessDeposit_originChainId_depositId" ON "gasless_deposit" ("originChainId", "depositId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_gaslessDeposit_destinationChainId" ON "gasless_deposit" ("destinationChainId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_gaslessDeposit_createdAt" ON "gasless_deposit" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gasless_deposit"`);
  }
}
