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
@Unique("UK_fallback_hyper_evm_flow_completed_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_fallback_hyper_evm_flow_completed_chainId", ["chainId"])
@Index("IX_fallback_hyper_evm_flow_completed_quoteNonce", ["quoteNonce"])
@Index("IX_fallback_hyper_evm_flow_completed_blockNumber", ["blockNumber"])
@Index("IX_fallback_hyper_evm_flow_completed_blockTimeStamp", [
  "blockTimestamp",
])
@Index("IX_fallback_hyper_evm_flow_completed_deletedAt", ["deletedAt"])
@Index("IX_fallback_hyper_evm_flow_completed_finalised", ["finalised"])
export class FallbackHyperEVMFlowCompleted {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ nullable: true })
  quoteNonce: string;

  @Column({ type: "varchar" })
  finalRecipient: string;

  @Column({ type: "varchar" })
  finalToken: string;

  @Column({ type: "numeric" })
  evmAmountIn: string;

  @Column({ type: "numeric" })
  bridgingFeesIncurred: string;

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

  @Column("boolean")
  finalised: boolean;

  @Column()
  blockTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
