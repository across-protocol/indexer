import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Bundle } from "../Bundle";

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

  @Column({ type: "jsonb" })
  chainIds: number[];

  @Column()
  poolRebalanceRoot: string;

  @Column()
  relayerRefundRoot: string;

  @Column()
  slowRelayRoot: string;

  @Column()
  proposer: string;

  @OneToOne(() => Bundle, (bundle) => bundle.proposal)
  bundle: Bundle;

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
