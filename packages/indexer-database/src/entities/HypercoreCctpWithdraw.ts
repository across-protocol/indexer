import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { DepositForBurn } from "./evm/DepositForBurn";
import { MessageReceived } from "./evm/MessageReceived";

@Entity()
@Unique("UK_hypercoreCctpWithdraw_fromAddress_hypercoreNonce", [
  "fromAddress",
  "hypercoreNonce",
])
export class HypercoreCctpWithdraw {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fromAddress: string;

  @Column({ type: "decimal" })
  hypercoreNonce: string;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "bigint" })
  destinationChainId: string;

  @Column()
  versionId: number;

  @Column()
  declaredLength: number;

  @Column()
  magicBytes: string;

  @Column()
  userData: string;

  @Column({ nullable: true })
  burnTxnHash: string;

  @Column({ nullable: true })
  mintTxnHash: string;

  @Column({ nullable: true })
  burnEventId: number;

  @OneToOne(() => DepositForBurn, { nullable: true })
  @JoinColumn({
    name: "burnEventId",
    foreignKeyConstraintName: "FK_hypercoreCctpWithdraw_burnEventId",
  })
  burnEvent: DepositForBurn;

  @Column({ nullable: true })
  mintEventId: number;

  @OneToOne(() => MessageReceived, { nullable: true })
  @JoinColumn({
    name: "mintEventId",
    foreignKeyConstraintName: "FK_hypercoreCctpWithdraw_mintEventId",
  })
  mintEvent: MessageReceived;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
