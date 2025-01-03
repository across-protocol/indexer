import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_swapBeforeBridgeEvent_originChainId_blockHash_txHash_logIndex", [
  "originChainId",
  "blockHash",
  "transactionHash",
  "logIndex",
])
export class SwapBeforeBridgeEvent {
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
  blockHash: string;

  @Column()
  transactionHash: string;

  @Column()
  logIndex: number;

  @Column()
  originChainId: number;

  @Column()
  depositId: number;

  @Column()
  depositEventId: number;

  @CreateDateColumn()
  createdAt: Date;
}
