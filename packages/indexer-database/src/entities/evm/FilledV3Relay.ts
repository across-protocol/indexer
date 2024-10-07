import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
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

@Entity({ schema: "evm" })
@Unique("UK_filledV3Relay_relayHash", ["relayHash"])
export class FilledV3Relay {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  relayHash: string;

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

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
