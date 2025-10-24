import {
  Column,
  Entity,
  PrimaryColumn,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity()
export class SponsoredDepositForBurn {
  @PrimaryColumn("varchar")
  id!: string; // txHash:logIndex

  @Index()
  @Column("varchar")
  quoteNonce!: string;

  @Index()
  @Column("varchar")
  originSender!: string;

  @Index()
  @Column("varchar")
  finalRecipient!: string;

  @Column("varchar")
  quoteDeadline!: string;

  @Column("varchar")
  maxBpsToSponsor!: string;

  @Column("varchar")
  maxUserSlippageBps!: string;

  @Column("varchar")
  finalToken!: string;

  @Column("varchar")
  signature!: string;

  @Index()
  @Column("int")
  blockNumber!: number;

  @Column("varchar")
  transactionHash!: string;

  @Column("int")
  transactionIndex!: number;

  @Column("int")
  logIndex!: number;

  @Column("boolean", { default: false })
  finalised!: boolean;

  @Column("timestamp")
  blockTimestamp!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  constructor(init: Partial<SponsoredDepositForBurn>) {
    Object.assign(this, init);
  }
}
