import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

// TODO: slowFillBundle when we have the Bundle entity. Or is it enough to reference that on Deposit?
@Entity()
@Unique("UK_slowFillRequest_uuid", ["uuid"])
export class SlowFillRequest {
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

  @Column()
  inputAmount: string;

  @Column()
  outputToken: string;

  @Column()
  outputAmount: string;

  @Column()
  message: string;

  @Column()
  exclusiveRelayer: string;

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
