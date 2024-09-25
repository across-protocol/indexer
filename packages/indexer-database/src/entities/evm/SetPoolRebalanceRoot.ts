import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ schema: "evm" })
export class SetPoolRebalanceRoot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  destinationChainId: number;

  @Column({ nullable: false })
  l1Token: string;

  @Column({ nullable: false })
  destinationToken: string;

  @Column({ nullable: false })
  transactionHash: string;

  @Column({ nullable: false })
  transactionIndex: number;

  @Column({ nullable: false })
  logIndex: number;

  @Column({ nullable: false })
  blockNumber: number;

  @CreateDateColumn()
  createdAt: Date;
}
