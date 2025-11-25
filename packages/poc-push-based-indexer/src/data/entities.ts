export interface UniTransfer {
  id?: number;
  chainId: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  fromAddress: string;
  toAddress: string;
  amount: string;
  finalised: boolean;
  createdAt?: Date;
}
