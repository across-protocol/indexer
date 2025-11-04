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
@Unique("UK_simpleTransferFlowCompleted_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_SimpleTransferFlowCompleted_chainId", ["chainId"])
@Index("IX_SimpleTransferFlowCompleted_quoteNonce", ["quoteNonce"])
@Index("IX_SimpleTransferFlowCompleted_finalRecipient", ["finalRecipient"])
@Index("IX_SimpleTransferFlowCompleted_blockNumber", ["blockNumber"])
@Index("IX_SimpleTransferFlowCompleted_blockTimeStamp", ["blockTimestamp"])
@Index("IX_SimpleTransferFlowCompleted_deletedAt", ["deletedAt"])
@Index("IX_SimpleTransferFlowCompleted_finalised", ["finalised"])
export class SimpleTransferFlowCompleted {
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
  evmAmountIn: number;

  @Column({ type: "bigint" })
  bridgingFeesIncurred: number;

  @Column({ type: "bigint" })
  evmAmountSponsored: number;

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
