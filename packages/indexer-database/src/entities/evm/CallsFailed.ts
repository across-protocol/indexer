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
@Unique("UK_callsFailed_blockNumber_chainId_logIndex", [
  "blockNumber",
  "chainId",
  "logIndex",
])
@Index("IX_callsFailed_finalised", ["finalised"])
@Index("IX_callsFailed_deletedAt", ["deletedAt"])
export class CallsFailed {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "jsonb" })
  calls: { target: string; calldata: string; value: string }[];

  @Column()
  fallbackRecipient: string;

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

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
