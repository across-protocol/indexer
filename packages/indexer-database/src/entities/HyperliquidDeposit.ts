import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique("UK_hyperliquidDeposit_block_txn_log", [
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_hyperliquidDeposit_finalised", ["finalised"])
@Index("IX_hyperliquidDeposit_deletedAt", ["deletedAt"])
@Index("IX_hyperliquidDeposit_user", ["user"])
@Index("IX_hyperliquidDeposit_blockTimestamp", ["blockTimestamp"])
export class HyperliquidDeposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

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

  @Column({ nullable: true })
  nonce?: string;

  @Column({ type: "text", nullable: true })
  rawData?: string;

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
