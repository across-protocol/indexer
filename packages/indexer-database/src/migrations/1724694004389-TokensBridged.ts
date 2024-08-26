import { MigrationInterface, QueryRunner } from "typeorm";

export class TokensBridged1724694004389 implements MigrationInterface {
  name = "TokensBridged1724694004389";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."tokens_bridged" (
          "id" SERIAL NOT NULL,
          "chainId" integer NOT NULL,
          "leafId" integer NOT NULL,
          "l2TokenAddress" character varying NOT NULL,
          "amountToReturn" character varying NOT NULL,
          "caller" character varying NOT NULL,
          "transactionHash" character varying NOT NULL,
          "transactionIndex" integer NOT NULL,
          "logIndex" integer NOT NULL,
          "blockNumber" integer NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UK_tokensBridged_chainId_leafId_l2TokenAddress_transactionHash" UNIQUE ("chainId", "leafId", "l2TokenAddress", "transactionHash"),
          CONSTRAINT "PK_ca5a436f7fabd6c700cb7327415" PRIMARY KEY ("id")
        )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evm"."tokens_bridged"`);
  }
}
