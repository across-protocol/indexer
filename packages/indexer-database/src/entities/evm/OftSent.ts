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
@Unique("UK_oftSent_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
@Index("IX_oftSent_finalised", ["finalised"])
@Index("IX_oftSent_deletedAt", ["deletedAt"])
@Index("IX_oftSent_chainId_blockNumber", ["chainId", "blockNumber"])
export class OFTSent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guid: string;

  @Column()
  dstEid: number;

  @Column()
  fromAddress: string;

  @Column({ type: "decimal" })
  amountSentLD: string;

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
