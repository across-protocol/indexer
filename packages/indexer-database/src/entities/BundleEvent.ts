import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Bundle } from "./Bundle";

export enum BundleEventType {
  Deposit = "deposit",
  ExpiredDeposit = "expiredDeposit",
  Fill = "fill",
  SlowFill = "slowFill",
  UnexecutableSlowFill = "unexecutableSlowFill",
}

@Entity()
export class BundleEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bundle, (bundle) => bundle.events)
  bundle: Bundle;

  @Column()
  bundleId: number;

  @Column({ type: "enum", enum: BundleEventType })
  type: BundleEventType;

  @Column()
  relayHash: string;

  @Column({ type: "decimal", nullable: true })
  repaymentChainId: string;

  @Column({ type: "bigint", nullable: true })
  eventChainId: string;

  @Column({ nullable: true })
  eventBlockNumber: number;

  @Column({ nullable: true })
  eventLogIndex: number;
}
