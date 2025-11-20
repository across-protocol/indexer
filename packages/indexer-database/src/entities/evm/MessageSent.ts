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
@Unique("UK_messageSent_chain_block_txn_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_messageSent_finalised", ["finalised"])
@Index("IX_messageSent_deletedAt", ["deletedAt"])
export class MessageSent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  message: string;

  @Column()
  version: number;

  @Column()
  sourceDomain: number;

  @Column()
  destinationDomain: number;

  @Column()
  nonce: string;

  @Column()
  sender: string;

  @Column()
  recipient: string;

  @Column()
  destinationCaller: string;

  @Column()
  minFinalityThreshold: number;

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
