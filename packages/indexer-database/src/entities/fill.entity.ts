import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum FillType {
  FastFill = 0,
  ReplacedSlowFill,
  SlowFill,
}

// TODO: Add refundBundle when we have the Bundle entity
@Entity()
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
  updatedRecipient: string;

  @Column()
  updatedMessage: string;

  @Column({ type: "decimal" })
  updatedOutputAmount: string;

  @Column()
  fillType: FillType;

  @Column()
  relayer: string;

  @Column()
  repaymentChainId: number;

  @Column({ nullable: true })
  effectiveRepaymentChainId: number;

  @Column()
  isValid: boolean;

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
