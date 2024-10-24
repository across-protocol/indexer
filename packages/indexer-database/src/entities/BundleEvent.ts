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
@Unique("UK_bundleEvent_eventType_relayHash", ["type", "relayHash"])
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

  @Column({ nullable: true })
  repaymentChainId: number;
}
