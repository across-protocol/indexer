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
@Unique("UK_depositForBurn_chainId_blockHash_logIndex", [
  "chainId",
  "blockHash",
  "logIndex",
])
@Index("IX_depositForBurn_finalised", ["finalised"])
@Index("IX_depositForBurn_deletedAt", ["deletedAt"])
export class DepositForBurn {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  burnToken: string;

  @Column({ type: "bigint" })
  amount: string;

  @Column()
  depositor: string;

  @Column()
  mintRecipient: string;

  @Column()
  destinationDomain: number;

  @Column()
  destinationTokenMessenger: string;

  @Column()
  destinationCaller: string;

  @Column({ type: "bigint" })
  maxFee: string;

  @Column()
  minFinalityThreshold: number;

  @Column()
  hookData: string;

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

  @Column()
  blockTimestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
