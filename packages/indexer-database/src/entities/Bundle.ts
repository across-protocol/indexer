import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProposedRootBundle } from "./evm/ProposedRootBundle";
import { RootBundleCanceled } from "./evm/RootBundleCanceled";
import { RootBundleExecuted } from "./evm/RootBundleExecuted";
import { RootBundleDisputed } from "./evm/RootBundleDisputed";
import { BundleBlockRange } from "./BundleBlockRange";

export enum BundleStatus {
  Proposed = "Proposed",
  Validated = "Validated",
  Canceled = "Canceled",
  Disputed = "Disputed",
  Executed = "Executed",
}

@Entity()
export class Bundle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  poolRebalanceRoot: string;

  @Column()
  relayerRefundRoot: string;

  @Column()
  slowRelayRoot: string;

  @OneToOne(() => ProposedRootBundle, { nullable: false })
  @JoinColumn({
    foreignKeyConstraintName: "FK_bundle_rootBundleProposeId",
  })
  proposal: ProposedRootBundle;

  @Column({ nullable: false })
  proposalId: number;

  @OneToOne(() => RootBundleCanceled, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_bundle_rootBundleCanceledId",
  })
  cancelation: RootBundleCanceled;

  @Column({ nullable: true })
  cancelationId: number;

  @OneToOne(() => RootBundleDisputed, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_bundle_rootBundleDisputedId",
  })
  dispute: RootBundleDisputed;

  @Column({ nullable: true })
  disputeId: number;

  @Column({ type: "enum", enum: BundleStatus, default: BundleStatus.Proposed })
  status: BundleStatus;

  @ManyToMany(() => RootBundleExecuted)
  @JoinTable({
    name: "bundle_executions", // Custom join table name
    joinColumn: {
      name: "bundleId",
      referencedColumnName: "id",
    },
    inverseJoinColumn: {
      name: "executionId",
      referencedColumnName: "id",
    },
  })
  executions: RootBundleExecuted[];

  @OneToMany(() => BundleBlockRange, (range) => range.bundle, {
    nullable: false,
  })
  ranges: BundleBlockRange[];
}
