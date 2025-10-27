import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_arbitraryActionsExecuted_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
export class ArbitraryActionsExecuted {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  chainId!: string;

  @Index()
  @Column()
  quoteNonce!: string;

  @Index()
  @Column()
  initialToken!: string;

  @Column()
  initialAmount!: string;

  @Index()
  @Column()
  finalToken!: string;

  @Column()
  finalAmount!: string;

  @Index()
  @Column({ name: "block_number" })
  blockNumber!: number;

  @Column({ name: "block_hash" })
  blockHash!: string;

  @Column({ name: "transaction_hash" })
  transactionHash!: string;

  @Column({ name: "transaction_index" })
  transactionIndex!: number;

  @Column({ name: "log_index" })
  logIndex!: number;

  @Index()
  @Column("boolean", { default: false })
  finalised!: boolean;

  @Column({ name: "block_timestamp" })
  blockTimestamp!: Date;

  @Index()
  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Index()
  @DeleteDateColumn({ nullable: true, name: "deleted_at" })
  deletedAt?: Date;

  constructor(init: Partial<ArbitraryActionsExecuted>) {
    Object.assign(this, init);
  }
}
