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
@Unique("UK_swapFlowFinalized_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SwapFlowFinalized_chainId", ["chainId"])
@Index("IX_SwapFlowFinalized_quoteNonce", ["quoteNonce"])
@Index("IX_SwapFlowFinalized_finalRecipient", ["finalRecipient"])
@Index("IX_SwapFlowFinalized_blockNumber", ["blockNumber"])
@Index("IX_SwapFlowFinalized_createdAt", ["createdAt"])
@Index("IX_SwapFlowFinalized_deletedAt", ["deletedAt"])
export class SwapFlowFinalized {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column()
  finalRecipient: string;

  @Column()
  finalToken: string;

  @Column({ type: "bigint" })
  totalSent: bigint;

  @Column({ type: "bigint" })
  evmAmountSponsored: bigint;

  @Column()
  blockNumber: number;

  @Column()
  transactionIndex: number;

  @Column()
  transactionHash: string;

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
