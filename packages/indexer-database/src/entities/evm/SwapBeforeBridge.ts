import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_swapBeforeBridge_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
@Index("IX_swapBeforeBridge_finalised", ["finalised"])
@Index("IX_swapBeforeBridge_deletedAt", ["deletedAt"])
@Index("IX_swapBeforeBridge_blockNumber", ["blockNumber"])
export class SwapBeforeBridge {
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
