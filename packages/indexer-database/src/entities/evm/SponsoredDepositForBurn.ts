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
@Unique("UK_sponsoredDepositForBurn_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
export class SponsoredDepositForBurn {
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
  originSender!: string;

  @Index()
  @Column({ name: "final_recipient" })
  finalRecipient!: string;

  @Column({ name: "quote_deadline" })
  quoteDeadline!: string;

  @Column({ name: "max_bps_to_sponsor" })
  maxBpsToSponsor!: string;

  @Column({ name: "max_user_slippage_bps" })
  maxUserSlippageBps!: string;

  @Column({ name: "final_token" })
  finalToken!: string;

  @Column()
  signature!: string;

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

  constructor(init: Partial<SponsoredDepositForBurn>) {
    Object.assign(this, init);
  }
}
