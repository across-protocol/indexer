import { utils, arch } from "@across-protocol/sdk";

const { EvmAddress, SvmAddress, chainIsEvm, chainIsSvm, isZeroAddress } = utils;

export function formatFromBytes32ToChainFormat(
  bytes32Address: string,
  chainId: number,
) {
  if (chainIsEvm(chainId)) {
    return EvmAddress.from(bytes32Address, "base16").toEvmAddress();
  } else if (chainIsSvm(chainId)) {
    // Handle special case if address is the zero address
    if (isZeroAddress(bytes32Address)) {
      return arch.svm.SVM_DEFAULT_ADDRESS;
    }
    return SvmAddress.from(bytes32Address, "base16").toBase58();
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}
