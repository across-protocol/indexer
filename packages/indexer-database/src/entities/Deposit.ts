import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from "typeorm";

// Import your existing entities
import { V3FundsDeposited } from "./evm/V3FundsDeposited";
import { FilledV3Relay } from "./evm/FilledV3Relay";
import { DepositForBurn } from "./evm/DepositForBurn";
import { MintAndWithdraw } from "./evm/MintAndWithdraw";
import { OFTSent } from "./evm/OftSent";
import { OFTReceived } from "./evm/OftReceived";

export enum DepositType {
  ACROSS = "across",
  CCTP = "cctp",
  OFT = "oft",
}

export enum DepositStatus {
  PENDING = "pending",
  FILLED = "filled",
}

@Entity({ schema: "public" })
@Unique("UK_deposits_uniqueId", ["uniqueId"])
// 1. Global Feed Index: Instant sorting by time
@Index("IX_deposits_blockTimestamp", ["blockTimestamp"])
// 2. User History Indices: Instant filtering by user + sorting
@Index("IX_deposits_depositor_timestamp", ["depositor", "blockTimestamp"])
@Index("IX_deposits_recipient_timestamp", ["recipient", "blockTimestamp"])
// 3. Status Index: Fast "Unfilled" lookups
@Index("IX_deposits_status_timestamp", ["status", "blockTimestamp"])
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * The ID which stitches together all the relevant events for a given transfer type.
   * OFT: guid
   * CCTP: nonce-destinationChainId
   * Across: relayHash / internalHash
   */
  @Column()
  uniqueId: string;

  @Column({ type: "enum", enum: DepositType })
  type: DepositType;

  @Column({ type: "enum", enum: DepositStatus, default: DepositStatus.PENDING })
  status: DepositStatus;

  // --- Denormalized Search Fields ---

  /**
   * The timestamp of the first event seen for a given uniqueId.
   */
  @Column()
  blockTimestamp: Date;

  @Column({ type: "bigint" })
  originChainId: string;

  @Column({ type: "bigint" })
  destinationChainId: string;

  /**
   * Nullable because an Orphan Fill (e.g. OFTReceived) does not know the depositor.
   * We update this when the source event arrives.
   */
  @Column({ nullable: true })
  depositor: string;

  @Column({ nullable: true })
  recipient: string;

  // --- Foreign Keys (Nullable for Orphan Support) ---

  // Across V3
  @Column({ nullable: true })
  v3FundsDepositedId: number | null;

  @OneToOne(() => V3FundsDeposited, { nullable: true })
  @JoinColumn({ name: "v3FundsDepositedId" })
  v3FundsDeposited: V3FundsDeposited;

  @Column({ nullable: true })
  filledV3RelayId: number | null;

  @OneToOne(() => FilledV3Relay, { nullable: true })
  @JoinColumn({ name: "filledV3RelayId" })
  filledV3Relay: FilledV3Relay;

  // CCTP
  @Column({ nullable: true })
  depositForBurnId: number | null;

  @OneToOne(() => DepositForBurn, { nullable: true })
  @JoinColumn({ name: "depositForBurnId" })
  depositForBurn: DepositForBurn;

  @Column({ nullable: true })
  mintAndWithdrawId: number | null;

  @OneToOne(() => MintAndWithdraw, { nullable: true })
  @JoinColumn({ name: "mintAndWithdrawId" })
  mintAndWithdraw: MintAndWithdraw;

  // OFT
  @Column({ nullable: true })
  oftSentId: number | null;

  @OneToOne(() => OFTSent, { nullable: true })
  @JoinColumn({ name: "oftSentId" })
  oftSent: OFTSent;

  @Column({ nullable: true })
  oftReceivedId: number | null;

  @OneToOne(() => OFTReceived, { nullable: true })
  @JoinColumn({ name: "oftReceivedId" })
  oftReceived: OFTReceived;

  // --- Metadata ---

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
