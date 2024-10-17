import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Bundle } from "./Bundle";

export enum BundleEventTypes {
  Deposit = "deposit",
  ExpiredDeposit = "expiredDeposit",
  Fill = "fill",
  SlowFill = "slowFill",
  UnexecutableSlowFill = "unexecutableSlowFill",
}

@Entity()
@Unique("UK_bundleEvents_eventType_relayHash", ["eventType", "relayHash"])
export class BundleEvents {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bundle, (bundle) => bundle.events)
  bundle: Bundle;

  @Column()
  bundleId: number;

  @Column({ type: "enum", enum: BundleEventTypes })
  eventType: BundleEventTypes;

  @Column()
  relayHash: string;

  @Column({ nullable: true })
  repaymentChainId: number;
}
