import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_errf_chain_rootBundle_leaf_txn", [
  "chainId",
  "rootBundleId",
  "leafId",
  "transactionHash",
])
export class ExecutedRelayerRefundRoot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  rootBundleId: number;

  @Column()
  leafId: number;

  @Column()
  l2TokenAddress: string;

  @Column()
  amountToReturn: string;

  @Column({ type: "jsonb" })
  refundAmounts: string[];

  @Column({ type: "jsonb" })
  refundAddresses: string[];

  @Column({ nullable: true })
  deferredRefunds: boolean;

  @Column({ nullable: true })
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
