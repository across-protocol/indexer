import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { interfaces } from "@across-protocol/sdk";
import { RelayHashInfo } from "../RelayHashInfo";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_filledV3Relay_internalHash", ["internalHash"])
@Index("IX_filledV3Relay_blockTimestamp", ["blockTimestamp"])
@Index("IX_filledV3Relay_relayer", ["relayer"])
@Index("IX_filledV3Relay_destinationChainId", ["destinationChainId"])
@Index("IX_filledV3Relay_destinationChainId_blockNumber", [
  "destinationChainId",
  "blockNumber",
])
@Index("IX_filledV3Relay_depositId_originChainId", [
  "depositId",
  "originChainId",
])
@Index("IX_filledV3Relay_originChainId_depositId", [
  "originChainId",
  "depositId",
])
export class FilledV3Relay {
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
  updatedRecipient: string;

  @Column()
  updatedMessage: string;

  @Column()
  updatedOutputAmount: string;

  @Column({ type: "enum", enum: interfaces.FillType })
  fillType: interfaces.FillType;

  @Column({ type: "simple-enum", enum: DataSourceType, nullable: true })
  dataSource: DataSourceType;

  @Column()
  relayer: string;

  @Column({ type: "decimal" })
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

  @Column({ nullable: true })
  blockTimestamp?: Date;

  /**
   * This is just the reverse side of the relationship,
   * no additional foreign keys or columns are added to this table
   */
  @OneToOne(() => RelayHashInfo, (relayHashInfo) => relayHashInfo.fillEvent)
  relayHashInfo: RelayHashInfo;
}
