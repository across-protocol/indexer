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
import { DepositForBurn } from "./evm/DepositForBurn";

/**
 * Table to store the burn events sent to be finalized by the
 * finalizer bot. Each row points to a burn event that has
 * been sent successfully to the finalizer bot.
 */
@Entity()
@Unique("UK_cctpFinalizerJob_burnEventId", ["burnEventId"])
export class CctpFinalizerJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  attestation: string;

  @Column()
  message: string;

  @Column()
  burnEventId: number;

  @Column({ nullable: true })
  sponsoredDepositForBurnId?: number;

  @OneToOne(() => DepositForBurn, (burnEvent) => burnEvent.id)
  @JoinColumn({ name: "burnEventId" })
  burnEvent: DepositForBurn;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
