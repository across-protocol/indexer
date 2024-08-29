import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_executedRelayerRefundRoot_chain_rootBundle_leaf", [
  "chainId",
  "rootBundleId",
  "leafId",
])
export class ExecutedRelayerRefundRoot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: number;

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

  @CreateDateColumn()
  createdAt: Date;
}
