import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { V3FundsDeposited } from "./evm/V3FundsDeposited";
import { FilledV3Relay } from "./evm/FilledV3Relay";
import { RequestedV3SlowFill } from "./evm/RequestedV3SlowFill";

export type RelayStatus =
  | "unfilled"
  | "filled"
  | "slowFillRequested"
  | "slowFilled"
  | "expired"
  | "refunded";

@Entity()
@Unique("UK_relayHashInfo_relayHash", ["relayHash"])
export class RelayHashInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  relayHash: string;

  @Column()
  depositId: number;

  @Column()
  originChainId: number;

  @OneToOne(() => V3FundsDeposited, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_relayHashInfo_depositEventId",
  })
  depositEvent: V3FundsDeposited;

  @OneToOne(() => FilledV3Relay, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_relayHashInfo_fillEventId",
  })
  fillEvent: FilledV3Relay;

  @OneToOne(() => RequestedV3SlowFill, { nullable: true })
  @JoinColumn({
    foreignKeyConstraintName: "FK_relayHashInfo_slowFillRequestEventId",
  })
  slowFillRequestEvent: RequestedV3SlowFill;

  @Column({ nullable: true })
  status: RelayStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
