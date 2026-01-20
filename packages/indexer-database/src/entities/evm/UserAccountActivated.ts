import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_userAccountActivated_block_chain_log", [
  "blockNumber",
  "chainId",
  "logIndex",
])
@Index("IX_userAccountActivated_finalised", ["finalised"])
@Index("IX_userAccountActivated_deletedAt", ["deletedAt"])
@Index("IX_userAccountActivated_token", ["token"])
export class UserAccountActivated {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user: string;

  @Column()
  token: string;

  @Column({ type: "decimal" })
  amountRequiredToActivate: string;

  @Column()
  blockHash: string;

  @Column()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  logIndex: number;

  @Column()
  chainId: number;

  @Column()
  finalised: boolean;

  @Column({ nullable: true })
  blockTimestamp?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
