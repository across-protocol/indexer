import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { OFTSent } from "./evm/OftSent";
import { OFTReceived } from "./evm/OftReceived";
import { RelayStatus } from "./RelayHashInfo";

@Entity()
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
  originTxnRef?: string | null;

  @Column({ nullable: true })
  destinationTxnRef?: string | null;

  @Column({ nullable: true })
  oftSentEventId?: number | null;

  @OneToOne(() => OFTSent, (oftSentEvent) => oftSentEvent.id)
  @JoinColumn({ name: "oftSentEventId" })
  oftSentEvent?: OFTSent;

  @Column({ nullable: true })
  oftReceivedEventId?: number | null;

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
  originGasFee?: string | null;

  @Column({ nullable: true, type: "decimal" })
  originGasFeeUsd?: string | null;

  @Column({ nullable: true, type: "decimal" })
  originGasTokenPriceUsd?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
