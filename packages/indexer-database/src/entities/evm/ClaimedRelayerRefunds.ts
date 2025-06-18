import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_claimedRelayerRefunds_token_address_txnHash", [
  "l2TokenAddress",
  "refundAddress",
  "transactionHash",
])
export class ClaimedRelayerRefunds {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "bigint" })
  chainId: string;

  @Column()
  l2TokenAddress: string;

  @Column()
  refundAddress: string;

  @Column()
  amount: string;

  @Column()
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

  @CreateDateColumn()
  createdAt: Date;
}
