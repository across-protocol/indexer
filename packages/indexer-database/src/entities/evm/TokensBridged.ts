import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity({ schema: "evm" })
@Unique("UK_tokensBridged_chainId_leafId_l2TokenAddress_transactionHash", [
  "chainId",
  "leafId",
  "l2TokenAddress",
  "transactionHash",
])
export class TokensBridged {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: number;

  @Column()
  leafId: number;

  @Column()
  l2TokenAddress: string;

  @Column()
  amountToReturn: string;

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

  @CreateDateColumn()
  createdAt: Date;
}
