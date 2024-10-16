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
@Unique("UK_rootBundleDisputed_txHash", ["transactionHash"])
export class RootBundleDisputed {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  disputer: string;

  @Column()
  requestTime: Date;

  @OneToOne(() => Bundle, (bundle) => bundle.dispute)
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
