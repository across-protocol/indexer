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
import { OFTSent } from "./evm/OftSent";
import { OFTReceived } from "./evm/OftReceived";
import { RelayStatus } from "./RelayHashInfo";

@Entity()
@Unique("UK_oft_transfer_guid", ["guid"])
@Index("IX_oft_transfer_origin_txn_ref", ["originTxnRef"])
@Index("IX_oft_transfer_status", ["status"])
export class OftTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guid: string;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "bigint" })
  destinationChainId: string;

  @Column({ nullable: true })
  originTokenAddress?: string;

  @Column({ nullable: true })
  destinationTokenAddress?: string;

  @Column({ type: "decimal", nullable: true })
  originTokenAmount?: string;

  @Column({ type: "decimal", nullable: true })
  destinationTokenAmount?: string;

  @Column({ nullable: true })
  originTxnRef?: string;

  @Column({ nullable: true })
  destinationTxnRef?: string;

  @Column({ nullable: true })
  oftSentEventId?: number;

  @OneToOne(() => OFTSent, (oftSentEvent) => oftSentEvent.id)
  @JoinColumn({ name: "oftSentEventId" })
  oftSentEvent?: OFTSent;

  @Column({ nullable: true })
  oftReceivedEventId?: number;

  @OneToOne(() => OFTReceived, (oftReceivedEvent) => oftReceivedEvent.id)
  @JoinColumn({ name: "oftReceivedEventId" })
  oftReceivedEvent?: OFTReceived;

  /** For consistency this shares the same status as the RelayHashInfo.
   * If other values than `unfilled` and `filled` are needed,
   * then we can create a new type for this
   */
  @Column({ type: "enum", enum: RelayStatus, default: RelayStatus.Unfilled })
  status: RelayStatus;

  @Column({ nullable: true, type: "decimal" })
  bridgeFeeUsd?: string;

  @Column({ nullable: true, type: "decimal" })
  originGasFee?: string;

  @Column({ nullable: true, type: "decimal" })
  originGasFeeUsd?: string;

  @Column({ nullable: true, type: "decimal" })
  originGasTokenPriceUsd?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
