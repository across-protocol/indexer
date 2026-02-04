import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_swapBeforeBridge_blockNumber_chainId_logIndex", [
  "blockNumber",
  "chainId",
  "logIndex",
])
@Index("IX_swapBeforeBridge_finalised", ["finalised"])
@Index("IX_swapBeforeBridge_deletedAt", ["deletedAt"])
export class SwapBeforeBridge {
  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })
  dataSource: DataSourceType;

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  swapToken: string;

  @Column()
  acrossInputToken: string;

  @Column()
  acrossOutputToken: string;

  @Column({ type: "decimal" })
  swapTokenAmount: string;

  @Column({ type: "decimal" })
  acrossInputAmount: string;

  @Column({ type: "decimal" })
  acrossOutputAmount: string;

  @Column()
  exchange: string;

  @Column({ type: "text", nullable: true })
  exchangeCalldata?: string;

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

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
