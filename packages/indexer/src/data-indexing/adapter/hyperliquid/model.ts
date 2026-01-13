/**
 * Hyperliquid deposit with block information
 */
export interface HyperliquidDepositEvent {
  blockNumber: number;
  transactionHash: string;
  blockTimestamp: Date;

  // Deposit-specific fields
  user: string;
  amount: string;
  token: string;
  depositType?: string;
  nonce?: string;
}
