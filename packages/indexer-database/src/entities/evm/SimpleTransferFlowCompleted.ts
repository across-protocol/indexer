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
@Index("IX_SimpleTransferFlowCompleted_createdAt", ["createdAt"])
@Index("IX_SimpleTransferFlowCompleted_deletedAt", ["deletedAt"])
export class SimpleTransferFlowCompleted {
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

  @Column()
  evmAmountIn: string;

  @Column()
  bridgingFeesIncurred: string;

  @Column()
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
