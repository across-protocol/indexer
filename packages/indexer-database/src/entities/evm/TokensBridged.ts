import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { DataSourceType } from "../../model";

@Entity({ schema: "evm" })
@Unique("UK_tokensBridged_chain_leaf_l2Token_txHash", [
  "chainId",
  "leafId",
  "l2TokenAddress",
  "transactionHash",
])
export class TokensBridged {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  leafId: number;

  @Column()
  l2TokenAddress: string;

  @Column()
  amountToReturn: string;

  @Column({ nullable: true })
  caller: string;

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

  @Column({
    type: "enum",
    enum: DataSourceType,
    default: DataSourceType.POLLING,
  })
  dataSource: DataSourceType;

  @CreateDateColumn()
  createdAt: Date;
}
