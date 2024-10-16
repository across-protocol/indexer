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
@Unique("UK_rootBundleCanceled_txHash", ["transactionHash"])
export class RootBundleCanceled {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  caller: string;

  @Column()
  requestTime: Date;

  @OneToOne(() => Bundle, (bundle) => bundle.cancelation)
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
