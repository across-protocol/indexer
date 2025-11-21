import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm", name: "swap_flow_finalized" })
@Unique("UK_swapFlowFinalized_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_swapFlowFinalized_chainId", ["chainId"])
@Index("IX_swapFlowFinalized_quoteNonce", ["quoteNonce"])
@Index("IX_swapFlowFinalized_finalRecipient", ["finalRecipient"])
@Index("IX_swapFlowFinalized_blockNumber", ["blockNumber"])
@Index("IX_swapFlowFinalized_blockTimestamp", ["blockTimestamp"])
@Index("IX_swapFlowFinalized_deletedAt", ["deletedAt"])
@Index("IX_swapFlowFinalized_finalised", ["finalised"])
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

  @Column({ type: "numeric" })
  totalSent: string;

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
