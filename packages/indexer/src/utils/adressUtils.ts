import { utils, arch } from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";

const { chainIsEvm, chainIsSvm } = utils;

export function formatFromAddressToChainFormat(
  address: utils.Address,
  chainId: number,
): string {
  if (address.isValidOn(chainId)) {
    if (chainIsEvm(chainId)) {
      return address.toEvmAddress();
    } else if (chainIsSvm(chainId)) {
      // Handle special case if address is the zero address
      if (address.isZeroAddress()) {
        return arch.svm.SVM_DEFAULT_ADDRESS;
      }
      return address.toBase58();
    }
  }
  // Throw error if chainId is not supported
  if (!chainIsEvm(chainId) && !chainIsSvm(chainId)) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  // Fallback to bytes32 when address is malformed for the chain
  return address.toBytes32();
}
