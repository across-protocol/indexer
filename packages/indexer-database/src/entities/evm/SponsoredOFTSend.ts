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
@Unique("UK_sponsoredOFTSend_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SponsoredOFTSend_chainId", ["chainId"])
@Index("IX_SponsoredOFTSend_quoteNonce", ["quoteNonce"])
@Index("IX_SponsoredOFTSend_originSender", ["originSender"])
@Index("IX_SponsoredOFTSend_finalRecipient", ["finalRecipient"])
@Index("IX_SponsoredOFTSend_blockNumber", ["blockNumber"])
@Index("IX_SponsoredOFTSend_finalised", ["finalised"])
@Index("IX_SponsoredOFTSend_deletedAt", ["deletedAt"])
export class SponsoredOFTSend {
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

  @Column()
  destinationHandler: string;

  @Column()
  quoteDeadline: Date;

  @Column({ type: "numeric" })
  maxBpsToSponsor: string;

  @Column({ type: "numeric" })
  maxUserSlippageBps: string;

  @Column()
  finalToken: string;

  @Column()
  sig: string;

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
