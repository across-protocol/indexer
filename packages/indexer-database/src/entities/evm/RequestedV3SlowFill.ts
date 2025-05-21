import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_requestedV3SlowFill_internalHash", ["internalHash"])
export class RequestedV3SlowFill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  relayHash?: string;

  @Column()
  internalHash: string;

  @Column({ type: "decimal" })
  depositId: string;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "bigint" })
  destinationChainId: string;

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

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
