import { MigrationInterface, QueryRunner } from "typeorm";

export class RootBundleId1756763527824 implements MigrationInterface {
  name = "RootBundleId1756763527824";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" DROP CONSTRAINT "UK_relayedRootBundle_chainId_rootBundleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" DROP CONSTRAINT "UK_executedRelayerRefundRoot_chain_rootBundle_leaf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ADD CONSTRAINT "UK_rrb_chainId_rootBundleId_txn" UNIQUE ("chainId", "rootBundleId", "transactionHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ADD CONSTRAINT "UK_errf_chain_rootBundle_leaf_txn" UNIQUE ("chainId", "rootBundleId", "leafId", "transactionHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" DROP CONSTRAINT "UK_errf_chain_rootBundle_leaf_txn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" DROP CONSTRAINT "UK_rrb_chainId_rootBundleId_txn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ADD CONSTRAINT "UK_executedRelayerRefundRoot_chain_rootBundle_leaf" UNIQUE ("chainId", "rootBundleId", "leafId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ADD CONSTRAINT "UK_relayedRootBundle_chainId_rootBundleId" UNIQUE ("chainId", "rootBundleId")`,
    );
  }
}
