/**
 * Hyperliquid deposit event data structure
 * Based on the writer_actions stream from QuickNode Hyperliquid API
 * (writer_actions contains system/core writer actions)
 */
export interface HyperliquidDepositEvent {
  // Block metadata
  blockNumber: number;
  blockTimestamp?: Date;
  transactionHash?: string;

  // Deposit data (structure depends on actual API response)
  // These fields will need to be adjusted based on actual Hyperliquid deposit event structure
  user?: string;
  amount?: string;
  token?: string;
  depositType?: string;
  nonce?: string;
  // Additional fields from the writer_actions stream
  [key: string]: any;
}

/**
 * Hyperliquid deposit with block information
 */
export interface HyperliquidDepositWithBlock {
  blockNumber: number;
  transactionHash: string;
  transactionIndex?: number;
  logIndex?: number;
  blockTimestamp: Date;

  // Deposit-specific fields
  user: string;
  amount: string;
  token: string;
  depositType?: string;
  nonce?: string;

  // Additional metadata
  rawData?: any;
}
