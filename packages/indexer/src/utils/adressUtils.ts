import { utils, arch } from "@across-protocol/sdk";

const { EvmAddress, SvmAddress, chainIsEvm, chainIsSvm, isZeroAddress } = utils;

export function formatFromAddressToChainFormat(
  address: utils.Address,
  chainId: number,
) {
  if (chainIsEvm(chainId)) {
    return address.toEvmAddress();
  } else if (chainIsSvm(chainId)) {
    // Handle special case if address is the zero address
    if (address.isZeroAddress()) {
      return arch.svm.SVM_DEFAULT_ADDRESS;
    }
    return address.toBase58();
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}
