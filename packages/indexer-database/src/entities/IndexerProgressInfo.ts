import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity()
export class IndexerProgressInfo {
  /**
   * The identifier of the blockchain indexer.
   * Usually this id has the format of `<CONTRACT_ADDRESS>-<CHAIN_ID>`.
   */
  @PrimaryColumn()
  id: string;

  /**
   * The last finalised block number that has been processed by the indexer.
   */
  @Column()
  lastFinalisedBlock: number;

  /**
   * The latest onchain block number at the time of the last
   * indexer progress info update.
   */
  @Column()
  latestBlockNumber: number;

  /**
   * Whether the indexer is still backfilling.
   */
  @Column()
  isBackfilling: boolean;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
