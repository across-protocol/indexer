import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_mintAndWithdraw_chain_block_txn_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_mintAndWithdraw_finalised", ["finalised"])
@Index("IX_mintAndWithdraw_deletedAt", ["deletedAt"])
export class MintAndWithdraw {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mintRecipient: string;

  @Column({ type: "decimal" })
  amount: string;

  @Column()
  mintToken: string;

  @Column({ type: "decimal" })
  feeCollected: string;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column()
  finalised: boolean;

  @Column()
  blockTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
