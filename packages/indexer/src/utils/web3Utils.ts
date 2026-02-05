import { providers } from "ethers";
import { PublicClient, Hash } from "viem";

/**
 * A library-agnostic interface for interacting with blockchain data.
 */
export interface GenericBlockchainProvider {
  getTransactionData(hash: string): Promise<string>;
}

/**
 * Adapter for Ethers v5/v6 providers.
 */
export class EthersAdapter implements GenericBlockchainProvider {
  constructor(private provider: providers.Provider) {}

  async getTransactionData(hash: string): Promise<string> {
    const tx = await this.provider.getTransaction(hash);
    return tx.data; // Ethers uses .data for transaction input
  }
}

/**
 * Adapter for Viem PublicClients.
 */
export class ViemAdapter implements GenericBlockchainProvider {
  constructor(private client: PublicClient) {}

  async getTransactionData(hash: string): Promise<string> {
    const tx = await this.client.getTransaction({ hash: hash as Hash });
    return tx.input; // Viem uses .input for transaction data
  }
}
