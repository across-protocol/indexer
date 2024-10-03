import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_rootBundleDisputed_txHash", ["transactionHash"])
export class RootBundleDisputed {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  disputer: string;

  @Column()
  requestTime: Date;

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
