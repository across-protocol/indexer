import { BlockRange } from "../model";

/**
 * Interface for data handlers that process block ranges and that are passed to an Indexer class.
 */
export interface IndexerDataHandler {
  /**
   * @returns A unique identifier for the data handler. This is used to store the last finalised block in a persistent cache/db.
   */
  getDataIdentifier: () => string;

  /**
   *
   * @returns The block number where the indexing should start from
   */
  getStartIndexingBlockNumber: () => number;

  /**
   * Block range processor that is called by the Indexer class.
   */
  processBlockRange: (
    blockRange: BlockRange,
    lastFinalisedBlock: number,
  ) => Promise<void>;
}
