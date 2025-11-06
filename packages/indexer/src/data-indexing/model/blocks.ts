export type BlockRange = {
  from: number;
  to: number;
};

export interface Block {
  blockNumber: number;
}

export interface Transaction {
  transactionHash: string;
  transactionIndex: number;
}

export interface Log extends Block, Transaction {
  logIndex: number;
}
