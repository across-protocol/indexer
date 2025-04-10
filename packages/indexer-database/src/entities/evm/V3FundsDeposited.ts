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
@Unique("UK_FundsDeposited_relayHash_block_txnHash_logIdx", [
  "relayHash",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_v3FundsDeposited_deletedAt", ["deletedAt"])
@Index("IX_v3FundsDeposited_finalised", ["finalised"])
@Index("IX_deposits_block_chain_logIndex", [
  "blockNumber",
  "originChainId",
  "logIndex",
])
@Index("IX_v3FundsDeposited_blockTimestamp", ["blockTimestamp"])
@Index("IX_v3FundsDeposited_depositor", ["depositor"])
export class V3FundsDeposited {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  relayHash: string;

  @Column({ type: "decimal" })
  depositId: string;

  @Column()
  originChainId: number;

  @Column()
  destinationChainId: number;

  @Column()
  fromLiteChain: boolean;

  @Column()
  toLiteChain: boolean;

  @Column()
  depositor: string;

  @Column()
  recipient: string;

  @Column()
  inputToken: string;

  @Column()
  inputAmount: string;

  @Column()
  outputToken: string;

  @Column()
  outputAmount: string;

  @Column()
  message: string;

  @Column({ nullable: true })
  messageHash?: string;

  @Column()
  internalHash: string;

  @Column()
  exclusiveRelayer: string;

  @Column({ nullable: true })
  exclusivityDeadline?: Date;

  @Column()
  fillDeadline: Date;

  @Column()
  quoteTimestamp: Date;

  @Column({ nullable: true })
  integratorId?: string;

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

  @Column({ nullable: true })
  blockTimestamp?: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
