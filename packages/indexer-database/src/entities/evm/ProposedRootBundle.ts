import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_proposedRootBundle_txHash", ["transactionHash"])
export class ProposedRootBundle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  challengePeriodEndTimestamp: Date;

  @Column()
  poolRebalanceLeafCount: number;

  @Column({ type: "jsonb" })
  bundleEvaluationBlockNumbers: number[];

  @Column()
  poolRebalanceRoot: string;

  @Column()
  relayerRefundRoot: string;

  @Column()
  slowRelayRoot: string;

  @Column()
  proposer: string;

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
