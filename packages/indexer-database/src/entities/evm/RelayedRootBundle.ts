import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_rrb_chainId_rootBundleId_txn", [
  "chainId",
  "rootBundleId",
  "transactionHash",
])
export class RelayedRootBundle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  rootBundleId: number;

  @Column()
  relayerRefundRoot: string;

  @Column()
  slowRelayRoot: string;

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
