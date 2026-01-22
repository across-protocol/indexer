import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_speedUpV3_depositId_originChain_txHash_logIdx", [
  "depositId",
  "originChainId",
  "transactionHash",
  "logIndex",
])
export class RequestedSpeedUpV3Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "decimal" })
  depositId: string;

  @Column()
  depositor: string;

  @Column()
  updatedRecipient: string;

  @Column()
  updatedMessage: string;

  @Column()
  updatedOutputAmount: string;

  @Column()
  depositorSignature: string;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column()
  finalised: boolean;

  @Column()
  blockNumber: number;

  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })
  @CreateDateColumn()
  createdAt: Date;
}
