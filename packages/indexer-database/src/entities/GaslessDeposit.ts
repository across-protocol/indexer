import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique("UK_gaslessDeposit_originChainId_depositId", [
  "originChainId",
  "depositId",
])
@Index("IX_gaslessDeposit_destinationChainId", ["destinationChainId"])
@Index("IX_gaslessDeposit_createdAt", ["createdAt"])
@Index("IX_gaslessDeposit_deletedAt", ["deletedAt"])
export class GaslessDeposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  originChainId: string;

  @Column()
  destinationChainId: string;

  @Column()
  depositId: string;

  @CreateDateColumn()
  createdAt: Date;

  /** Set when the deposit is marked failed (e.g. via DLQ). */
  @Column({ type: "timestamp", nullable: true })
  deletedAt: Date | null;
}
