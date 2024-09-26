import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ schema: "evm" })
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

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @CreateDateColumn()
  createdAt: Date;
}
