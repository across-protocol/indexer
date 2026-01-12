/**
 * Hyperliquid deposit with block information
 */
export interface HyperliquidDepositEvent {
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
