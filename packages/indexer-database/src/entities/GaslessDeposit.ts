import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique("UK_gaslessDeposit_originChainId_destinationChainId_depositId", [
  "originChainId",
  "destinationChainId",
  "depositId",
])
@Index("IX_gaslessDeposit_originChainId_depositId", [
  "originChainId",
  "depositId",
])
@Index("IX_gaslessDeposit_destinationChainId", ["destinationChainId"])
@Index("IX_gaslessDeposit_createdAt", ["createdAt"])
export class GaslessDeposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  originChainId: string;

  @Column()
  destinationChainId: string;

  @Column()
  depositId: string;

  @CreateDateColumn()
  createdAt: Date;
}
