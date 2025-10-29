import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { RelayHashInfo } from "../RelayHashInfo";

@Entity({ schema: "evm" })
@Unique("UK_swapMetadata_blockNumber_chainId_logIndex", [
  "blockNumber",
  "chainId",
  "logIndex",
])
@Index("IX_swapMetadata_finalised", ["finalised"])
@Index("IX_swapMetadata_deletedAt", ["deletedAt"])
@Index("IX_swapMetadata_swapProvider", ["swapProvider"])
@Index("IX_swapMetadata_recipient", ["recipient"])
@Index("IX_swapMetadata_address", ["address"])
export class SwapMetadata {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  version: string;

  @Column()
  type: string;

  @Column()
  side: string;

  @Column()
  address: string;

  @Column({ type: "decimal" })
  maximumAmountIn: string;

  @Column({ type: "decimal" })
  minAmountOut: string;

  @Column({ type: "decimal" })
  expectedAmountOut: string;

  @Column({ type: "decimal" })
  expectedAmountIn: string;

  @Column()
  swapProvider: string;

  @Column({ type: "decimal" })
  slippage: string;

  @Column()
  autoSlippage: boolean;

  @Column()
  recipient: string;

  @Column({ nullable: true })
  appFeeRecipient?: string;

  @Column()
  blockHash: string;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  logIndex: number;

  @Column()
  chainId: number;

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  blockTimestamp?: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  relayHashInfoId: number | null;

  @ManyToOne(() => RelayHashInfo, { nullable: true })
  @JoinColumn({
    name: "relayHashInfoId",
    foreignKeyConstraintName: "FK_swapMetadata_relayHashInfoId",
  })
  relayHashInfo: RelayHashInfo;
}
