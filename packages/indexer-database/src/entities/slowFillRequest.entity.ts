import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// TODO: Add slowFillBundle when we have the Bundle entity?
@Entity()
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  uuid: string; // is this needed?

  @Column()
  depositId: number;

  @Column()
  originChainId: number;

  @Column()
  destinationChainId: number;

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
