import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProposedRootBundle } from "../evm/ProposedRootBundle";
import { RootBundleCanceled } from "../evm/RootBundleCanceled";
import { RootBundleExecuted } from "../evm/RootBundleExecuted";
import { RootBundleDisputed } from "../evm/RootBundleDisputed";

export enum BundleStatus {
  Proposed = "Proposed",
  Validated = "Validated",
  Canceled = "Canceled",
  Disputed = "Disputed",
  Executed = "Executed",
}

@Entity({ schema: "aggregate" })
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

  @OneToOne(() => RootBundleCanceled, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_bundle_rootBundleCanceledId",
  })
  cancelation: RootBundleCanceled;

  @ManyToMany(() => RootBundleExecuted)
  @JoinTable({
    name: "bundle_executions_join", // Custom join table name
    joinColumn: {
      name: "bundle_id",
      referencedColumnName: "id",
    },
    inverseJoinColumn: {
      name: "execution_id",
      referencedColumnName: "id",
    },
  })
  executions: RootBundleExecuted[];

  @OneToOne(() => RootBundleDisputed, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_bundle_rootBundleDisputedId",
  })
  dispute: RootBundleDisputed;

  @Column({ type: "enum", enum: BundleStatus })
  status: BundleStatus;
}
