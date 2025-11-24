import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_sponsoredAccountActivation_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SponsoredAccountActivation_chainId", ["chainId"])
@Index("IX_SponsoredAccountActivation_quoteNonce", ["quoteNonce"])
@Index("IX_SponsoredAccountActivation_blockNumber", ["blockNumber"])
@Index("IX_SponsoredAccountActivation_blockTimestamp", ["blockTimestamp"])
@Index("IX_SponsoredAccountActivation_deletedAt", ["deletedAt"])
@Index("IX_SponsoredAccountActivation_finalised", ["finalised"])
@Index("IX_SponsoredAccountActivation_finalRecipient", ["finalRecipient"])
export class SponsoredAccountActivation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column()
  finalRecipient: string;

  @Column()
  fundingToken: string;

  @Column({ type: "numeric" })
  evmAmountSponsored: string;

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
