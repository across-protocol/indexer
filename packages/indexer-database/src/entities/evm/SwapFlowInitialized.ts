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
@Unique("UK_swapFlowInitialized_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SwapFlowInitialized_chainId", ["chainId"])
@Index("IX_SwapFlowInitialized_quoteNonce", ["quoteNonce"])
@Index("IX_SwapFlowInitialized_finalRecipient", ["finalRecipient"])
@Index("IX_SwapFlowInitialized_blockNumber", ["blockNumber"])
@Index("IX_SwapFlowInitialized_createdAt", ["createdAt"])
@Index("IX_SwapFlowInitialized_deletedAt", ["deletedAt"])
export class SwapFlowInitialized {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column()
  finalRecipient: string;

  @Column()
  finalToken: string;

  @Column({ type: "bigint" })
  evmAmountIn: string;

  @Column({ type: "bigint" })
  bridgingFeesIncurred: string;

  @Column({ type: "bigint" })
  coreAmountIn: string;

  @Column()
  minAmountToSend: string;

  @Column()
  maxAmountToSend: string;

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
