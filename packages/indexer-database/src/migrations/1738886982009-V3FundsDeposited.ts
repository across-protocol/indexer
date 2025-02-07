import { MigrationInterface, QueryRunner } from "typeorm";

export class V3FundsDeposited1738886982009 implements MigrationInterface {
  name = "V3FundsDeposited1738886982009";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(
    //   `update evm.v3_funds_deposited set "internalHash" = "relayHash" where "relayHash" is not null;`
    // );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(
    //   `update evm.v3_funds_deposited set "internalHash" = null where "internalHash" is not null;`
    // );
  }
}
