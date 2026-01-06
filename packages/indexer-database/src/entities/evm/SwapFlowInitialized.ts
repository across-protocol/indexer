import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
  Unique,
} from "typeorm";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_swapFlowInitialized_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_swapFlowInitialized_chainId", ["chainId"])
@Index("IX_swapFlowInitialized_quoteNonce", ["quoteNonce"])
@Index("IX_swapFlowInitialized_finalRecipient", ["finalRecipient"])
@Index("IX_swapFlowInitialized_blockNumber", ["blockNumber"])
@Index("IX_swapFlowInitialized_blockTimeStamp", ["blockTimestamp"])
@Index("IX_swapFlowInitialized_deletedAt", ["deletedAt"])
@Index("IX_swapFlowInitialized_finalised", ["finalised"])
@Index("IX_swapFlowInitialized_contractAddress", ["contractAddress"])
export class SwapFlowInitialized {
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
  evmAmountIn: string;

  @Column({ type: "numeric" })
  bridgingFeesIncurred: string;

  @Column({ type: "numeric" })
  coreAmountIn: string;

  @Column({ type: "numeric" })
  minAmountToSend: string;

  @Column({ type: "numeric" })
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

  @Column({ nullable: true })
  contractAddress?: string;

  @Column({ type: "simple-enum", enum: DataSourceType, nullable: true })
  dataSource?: DataSourceType;
}
