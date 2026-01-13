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
@Unique("UK_hyperliquidDeposit_block_txn", ["blockNumber", "transactionHash"])
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

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
