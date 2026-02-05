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
import { DataSourceType } from "../../model";

export enum SwapSide {
  ORIGIN_SWAP = 0,
  DESTINATION_SWAP = 1,
}

export enum SwapType {
  EXACT_INPUT = 0,
  MIN_OUTPUT = 1,
  EXACT_OUTPUT = 2,
}

@Entity({ schema: "evm" })
@Unique("UK_swapMetadata_chainId_blockNumber_transactionHash_logIndex", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_swapMetadata_finalised", ["finalised"])
@Index("IX_swapMetadata_deletedAt", ["deletedAt"])
@Index("IX_swapMetadata_swapProvider", ["swapProvider"])
@Index("IX_swapMetadata_recipient", ["recipient"])
@Index("IX_swapMetadata_address", ["address"])
@Index("IX_swapMetadata_relayHashInfoId_side_deletedAt", [
  "relayHashInfoId",
  "side",
  "deletedAt",
])
export class SwapMetadata {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  version: string;

  @Column({ type: "enum", enum: SwapType })
  type: SwapType;

  @Column({ type: "enum", enum: SwapSide })
  side: SwapSide;

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

  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })
  dataSource: DataSourceType;

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
