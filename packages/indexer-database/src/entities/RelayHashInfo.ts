import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { V3FundsDeposited } from "./evm/V3FundsDeposited";
import { FilledV3Relay } from "./evm/FilledV3Relay";
import { RequestedV3SlowFill } from "./evm/RequestedV3SlowFill";
import { HistoricPrice } from "./HistoricPrice";

export enum RelayStatus {
  Unfilled = "unfilled",
  Filled = "filled",
  SlowFillRequested = "slowFillRequested",
  SlowFilled = "slowFilled",
  Expired = "expired",
  Refunded = "refunded",
}

@Entity()
@Unique("UK_relayHashInfo_internalHash_depositEvent", [
  "internalHash",
  "depositEventId",
])
@Index("IX_rhi_originChainId_depositId", ["originChainId", "depositId"])
@Index("IX_rhi_depositTxHash", ["depositTxHash"])
@Index("IX_rhi_origin_deadline_status", [
  "originChainId",
  "fillDeadline",
  "status",
])
export class RelayHashInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  relayHash: string;

  @Column({ nullable: true })
  internalHash: string;

  @Column({ type: "decimal" })
  depositId: string;

  @Column()
  originChainId: number;

  @Column()
  destinationChainId: number;

  @Column({ nullable: true })
  depositTxHash: string;

  @Column({ nullable: true })
  depositEventId: number;

  @OneToOne(() => V3FundsDeposited, { nullable: true })
  @JoinColumn({
    name: "depositEventId",
    foreignKeyConstraintName: "FK_relayHashInfo_depositEventId",
  })
  depositEvent: V3FundsDeposited;

  @Column({ nullable: true })
  fillTxHash: string;

  @Column({ nullable: true })
  fillEventId: number;

  @OneToOne(() => FilledV3Relay, { nullable: true })
  @JoinColumn({
    name: "fillEventId",
    foreignKeyConstraintName: "FK_relayHashInfo_fillEventId",
  })
  fillEvent: FilledV3Relay;

  @Column({ nullable: true })
  slowFillRequestEventId: number;

  @OneToOne(() => RequestedV3SlowFill, { nullable: true })
  @JoinColumn({
    name: "slowFillRequestEventId",
    foreignKeyConstraintName: "FK_relayHashInfo_slowFillRequestEventId",
  })
  slowFillRequestEvent: RequestedV3SlowFill;

  @Column()
  fillDeadline: Date;

  @Column({ type: "enum", enum: RelayStatus, default: RelayStatus.Unfilled })
  status: RelayStatus;

  @Column({ nullable: true })
  depositRefundTxHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, type: "decimal" })
  bridgeFeeUsd: string;
  @Column({ nullable: true, type: "decimal" })
  inputPriceUsd: string;
  @Column({ nullable: true, type: "decimal" })
  outputPriceUsd: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
