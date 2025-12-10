import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_arbitrary_actions_executed_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_arbitrary_actions_executed_chainId", ["chainId"])
@Index("IX_arbitrary_actions_executed_quoteNonce", ["quoteNonce"])
@Index("IX_arbitrary_actions_executed_blockNumber", ["blockNumber"])
@Index("IX_arbitrary_actions_executed_blockTimeStamp", ["blockTimestamp"])
@Index("IX_arbitrary_actions_executed_deletedAt", ["deletedAt"])
@Index("IX_arbitrary_actions_executed_finalised", ["finalised"])
@Index("IX_arbitrary_actions_executed_contractAddress", ["contractAddress"])
export class ArbitraryActionsExecuted {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column({ type: "varchar" })
  initialToken: string;

  @Column({ type: "numeric" })
  initialAmount: string;

  @Column({ type: "varchar" })
  finalToken: string;

  @Column({ type: "numeric" })
  finalAmount: string;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column("boolean")
  finalised: boolean;

  @Column()
  blockTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  contractAddress?: string;
}
