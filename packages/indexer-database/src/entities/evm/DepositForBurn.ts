import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { CctpFinalizerJob } from "../CctpFinalizerJob";

@Entity({ schema: "evm" })
@Unique("UK_depositForBurn_chain_block_txn_log", [
  "chainId",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_depositForBurn_finalised", ["finalised"])
@Index("IX_depositForBurn_deletedAt", ["deletedAt"])
export class DepositForBurn {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  burnToken: string;

  @Column({ type: "decimal" })
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

  @Column({ type: "decimal" })
  maxFee: string;

  @Column()
  minFinalityThreshold: number;

  @Column()
  hookData: string;

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

  @OneToOne(() => CctpFinalizerJob, (finalizerJob) => finalizerJob.burnEvent)
  finalizerJob: CctpFinalizerJob;
}
