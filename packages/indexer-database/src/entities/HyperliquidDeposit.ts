import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { DepositForBurn } from "./evm/DepositForBurn";

@Entity()
@Unique("UK_hyperliquidDeposit_hypercore_identifier", ["hypercoreIdentifier"])
@Index("IX_hyperliquidDeposit_finalised", ["finalised"])
@Index("IX_hyperliquidDeposit_deletedAt", ["deletedAt"])
@Index("IX_hyperliquidDeposit_user", ["user"])
@Index("IX_hyperliquidDeposit_blockTimestamp", ["blockTimestamp"])
@Index("IX_hyperliquidDeposit_cctpBurnEventId", ["cctpBurnEventId"])
export class HyperliquidDeposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  blockTimestamp: Date;

  @Column()
  user: string;

  @Column({ type: "decimal" })
  amount: string;

  @Column()
  token: string;

  @Column({ nullable: true })
  depositType?: string;

  @Column()
  nonce: string;

  @Column()
  hypercoreIdentifier: string;

  @Column({ nullable: true })
  cctpBurnEventId?: number;

  @ManyToOne(() => DepositForBurn, { nullable: true })
  @JoinColumn({
    name: "cctpBurnEventId",
    foreignKeyConstraintName: "FK_hyperliquidDeposit_cctpBurnEventId",
  })
  cctpBurnEvent?: DepositForBurn;

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
