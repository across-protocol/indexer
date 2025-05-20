import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_relayedRootBundle_chainId_rootBundleId", [
  "chainId",
  "rootBundleId",
])
export class RelayedRootBundle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: number;

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
