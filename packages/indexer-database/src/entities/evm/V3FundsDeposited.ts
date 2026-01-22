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
import { RelayHashInfo } from "../RelayHashInfo";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_FundsDeposited_relayHash_block_txnHash_logIdx", [
  "relayHash",
  "blockNumber",
  "transactionHash",
  "logIndex",
])
@Index("IX_v3FundsDeposited_deletedAt", ["deletedAt"])
@Index("IX_v3FundsDeposited_finalised", ["finalised"])
@Index("IX_v3FundsDeposited_blockTimestamp", ["blockTimestamp"])
@Index("IX_v3FundsDeposited_depositor", ["depositor"])
@Index("IX_v3FundsDeposited_recipient", ["recipient"])
@Index("IX_v3FundsDeposited_destinationChainId", ["destinationChainId"])
@Index("IX_deposits_block_chain_logIndex", [
  "blockNumber",
  "originChainId",
  "logIndex",
])
@Index("IX_v3FundsDeposited_depositId_originChainId", [
  "depositId",
  "originChainId",
])
@Index("IX_v3FundsDeposited_originChainId_depositId", [
  "originChainId",
  "depositId",
])
@Index("IX_v3FundsDeposited_internalHash", ["internalHash"])
export class V3FundsDeposited {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  relayHash: string;

  @Column({ type: "decimal" })
  depositId: string;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "bigint" })
  destinationChainId: string;

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

  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })

  /**
   * This is just the reverse side of the relationship,
   * no additional foreign keys or columns are added to this table
   */
  @OneToOne(() => RelayHashInfo, (relayHashInfo) => relayHashInfo.depositEvent)
  relayHashInfo: RelayHashInfo;
}
