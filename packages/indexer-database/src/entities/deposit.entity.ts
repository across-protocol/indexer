import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

export type DepositStatus =
  | "unfilled"
  | "filled"
  | "slowFillRequested"
  | "slowFilled"
  | "expired"
  | "refunded";

// TODO: Add expiredRefundBundle and slowFillBundle when we have the Bundle entity
@Entity()
@Unique("UK_deposit_depositId_originChainId", ["depositId", "originChainId"])
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  uuid: string;

  @Column()
  depositId: number;

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

  @Column({ type: "decimal" })
  inputAmount: string;

  @Column()
  outputToken: string;

  @Column({ type: "decimal" })
  outputAmount: string;

  @Column({ default: "0x" })
  message: string;

  @Column({ nullable: true })
  exclusiveRelayer?: string;

  @Column({ nullable: true })
  exclusivityDeadline?: Date;

  @Column()
  fillDeadline: Date;

  @Column()
  quoteTimestamp: number;

  @Column({ default: "unfilled" })
  status: DepositStatus;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column()
  blockNumber: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
