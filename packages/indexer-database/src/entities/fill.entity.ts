import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { interfaces } from "@across-protocol/sdk";

class RelayExecutionInfo {
  @Column()
  updatedRecipient: string;

  @Column()
  updatedMessage: string;

  @Column()
  updatedOutputAmount: string;

  @Column({ type: "enum", enum: interfaces.FillType })
  fillType: interfaces.FillType;
}

// TODO: Add refundBundle when we have the Bundle entity
// TODO: Add effectiveRepaymentChainId
@Entity()
@Unique("UK_fill_uuid_transactionHash_logIndex", [
  "uuid",
  "transactionHash",
  "logIndex",
])
export class Fill {
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

  @Column(() => RelayExecutionInfo, { prefix: false })
  relayExecutionInfo: RelayExecutionInfo;

  @Column({ nullable: true })
  isValid: boolean;

  @Column()
  relayer: string;

  @Column()
  repaymentChainId: number;

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
