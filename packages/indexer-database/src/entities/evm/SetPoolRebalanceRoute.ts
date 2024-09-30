import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_spr_transactionHash_transactionIndex_logIndex", [
  "transactionHash",
  "transactionIndex",
  "logIndex",
])
export class SetPoolRebalanceRoute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  destinationChainId: number;

  @Column({ nullable: false })
  l1Token: string;

  @Column({ nullable: false })
  destinationToken: string;

  @Column({ nullable: false })
  blockNumber: number;

  @Column({ nullable: false })
  transactionHash: string;

  @Column({ nullable: false })
  transactionIndex: number;

  @Column({ nullable: false })
  logIndex: number;

  @Column()
  finalised: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
