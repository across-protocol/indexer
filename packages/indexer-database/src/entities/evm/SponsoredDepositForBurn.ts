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
@Unique("UK_sponsoredDepositForBurn_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SponsoredDepositForBurn_chainId", ["chainId"])
@Index("IX_SponsoredDepositForBurn_quoteNonce", ["quoteNonce"])
@Index("IX_SponsoredDepositForBurn_originSender", ["originSender"])
@Index("IX_SponsoredDepositForBurn_finalRecipient", ["finalRecipient"])
@Index("IX_SponsoredDepositForBurn_blockNumber", ["blockNumber"])
@Index("IX_SponsoredDepositForBurn_finalised", ["finalised"])
@Index("IX_SponsoredDepositForBurn_createdAt", ["createdAt"])
@Index("IX_SponsoredDepositForBurn_deletedAt", ["deletedAt"])
export class SponsoredDepositForBurn {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column()
  originSender: string;

  @Column()
  finalRecipient: string;

  @Column({ type: "bigint" })
  quoteDeadline: Date;

  @Column({ type: "bigint" })
  maxBpsToSponsor: string;

  @Column({ type: "bigint" })
  maxUserSlippageBps: string;

  @Column()
  finalToken: string;

  @Column()
  signature: string;

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
