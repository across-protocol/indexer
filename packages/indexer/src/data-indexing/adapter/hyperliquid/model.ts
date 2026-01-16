/**
 * Hyperliquid deposit with block information
 */
export interface HyperliquidDepositEvent {
  blockNumber: number;
  transactionHash: string | null;
  blockTimestamp: Date;

  // Deposit-specific fields
  user: string;
  amount: string | null;
  token: string | null;
  depositType: string | null;
  nonce: string;
}
