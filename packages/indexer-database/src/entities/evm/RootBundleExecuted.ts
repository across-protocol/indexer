import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_rootBundleExecuted_chain_leaf_groupIdx_txHash", [
  "chainId",
  "leafId",
  "groupIndex",
  "transactionHash",
])
export class RootBundleExecuted {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  leafId: number;

  @Column()
  groupIndex: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column({ type: "jsonb" })
  l1Tokens: string[];

  @Column({ type: "jsonb" })
  bundleLpFees: string[];

  @Column({ type: "jsonb" })
  netSendAmounts: string[];

  @Column({ type: "jsonb" })
  runningBalances: string[];

  @Column()
  caller: string;

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
}
