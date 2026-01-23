import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_claimedRelayerRefunds_chain_block_tx_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
export class ClaimedRelayerRefunds {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  l2TokenAddress: string;

  @Column()
  refundAddress: string;

  @Column()
  amount: string;

  @Column({ nullable: true })
  caller: string;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column()
  blockNumber: number;

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })
  dataSource: DataSourceType;
}
