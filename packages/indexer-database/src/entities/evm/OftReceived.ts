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
@Unique("UK_oftReceived_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
@Index("IX_oftReceived_finalised", ["finalised"])
@Index("IX_oftReceived_deletedAt", ["deletedAt"])
@Index("IX_oftReceived_guid_deletedAt", ["guid", "deletedAt"])
@Index("IX_oftReceived_chainId_blockNumber", ["chainId", "blockNumber"])
export class OFTReceived {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guid: string;

  @Column()
  srcEid: number;

  @Column()
  toAddress: string;

  @Column({ type: "decimal" })
  amountReceivedLD: string;

  @Column()
  token: string;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  blockHash: string;

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

  @Column({ type: "simple-enum", enum: DataSourceType, nullable: true })
  dataSource?: DataSourceType;

  @Column()
  blockTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
