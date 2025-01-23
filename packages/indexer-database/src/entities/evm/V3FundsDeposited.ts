import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_v3FundsDeposited_relayHash_block_logIdx", [
  "relayHash",
  "blockNumber",
  "logIndex",
])
export class V3FundsDeposited {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  relayHash: string;

  @Column({ type: "decimal" })
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
}
