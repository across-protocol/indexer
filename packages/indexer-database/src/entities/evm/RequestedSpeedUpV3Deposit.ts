import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_requestedSpeedUpV3_depositId_originChain_txHash", [
  "depositId",
  "originChainId",
  "transactionHash",
])
export class RequestedSpeedUpV3Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  originChainId: number;

  @Column()
  depositId: number;

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
  blockNumber: number;

  @CreateDateColumn()
  createdAt: Date;
}
