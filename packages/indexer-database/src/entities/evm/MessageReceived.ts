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
@Unique("UK_messageReceived_chain_block_txn_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_messageReceived_finalised", ["finalised"])
@Index("IX_messageReceived_deletedAt", ["deletedAt"])
export class MessageReceived {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  caller: string;

  @Column()
  sourceDomain: number;

  @Column()
  nonce: string;

  @Column()
  sender: string;

  @Column()
  finalityThresholdExecuted: number;

  @Column()
  messageBody: string;

  @Column({ type: "bigint" })
  chainId: string;

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
}
