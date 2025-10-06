import { ethers } from "ethers";
import {
  CCTP_NO_DOMAIN,
  PRODUCTION_NETWORKS,
  TEST_NETWORKS,
} from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";

/**
 * Converts a 32-byte hex string with padding to a standard ETH address.
 * @param bytes32 The 32-byte hex string to convert.
 * @returns The ETH address representation of the 32-byte hex string.
 */
export function cctpBytes32ToAddress(bytes32: string): string {
  // Grab the last 20 bytes of the 32-byte hex string
  return ethers.utils.getAddress(ethers.utils.hexDataSlice(bytes32, 12));
}

export function decodeMessage(message: string, isSvm = false) {
  // Source: https://developers.circle.com/stablecoins/message-format
  const messageBytesArray = ethers.utils.arrayify(message);
  const version = Number(ethers.utils.hexlify(messageBytesArray.slice(0, 4)));
  const sourceDomain = Number(
    ethers.utils.hexlify(messageBytesArray.slice(4, 8)),
  ); // sourceDomain 4 bytes starting index 4
  const destinationDomain = Number(
    ethers.utils.hexlify(messageBytesArray.slice(8, 12)),
  ); // destinationDomain 4 bytes starting index 8
  const nonce = ethers.utils.hexlify(messageBytesArray.slice(12, 44)); // nonce	12	bytes32	32	Nonce of the message
  const sender = ethers.utils.hexlify(messageBytesArray.slice(44, 76)); // sender	44	bytes32	32	Address of MessageTransmitterV2 caller on source domain
  const recipient = ethers.utils.hexlify(messageBytesArray.slice(76, 108)); // recipient	76	bytes32	32	Address to handle message body on destination domain
  const destinationCaller = ethers.utils.hexlify(
    messageBytesArray.slice(108, 140),
  ); // destinationCaller	108	bytes32	32	Address to handle message body on destination domain
  const minFinalityThreshold = Number(
    ethers.utils.hexlify(messageBytesArray.slice(140, 144)),
  ); // minFinalityThreshold	140	bytes32	32	Minimum finality threshold for the message
  const finalityThresholdExecuted = Number(
    ethers.utils.hexlify(messageBytesArray.slice(144, 148)),
  ); // finalityThresholdExecuted	144	bytes32	32	Finality threshold executed for the message
  const messageBody = ethers.utils.hexlify(
    messageBytesArray.slice(148, messageBytesArray.length),
  ); // messageBody

  return {
    version,
    sourceDomain,
    destinationDomain,
    nonce,
    sender,
    recipient,
    destinationCaller,
    minFinalityThreshold,
    finalityThresholdExecuted,
    messageBody,
  };
}

export function getCctpDestinationChainFromDomain(
  domain: number,
  productionNetworks: boolean = true,
): number {
  if (domain === CCTP_NO_DOMAIN) {
    throw new Error(
      "Cannot input CCTP_NO_DOMAIN to getCctpDestinationChainFromDomain",
    );
  }
  // Test and Production networks use the same CCTP domain, so we need to use the flag passed in to
  // determine whether to use the Test or Production networks.
  const networks = productionNetworks ? PRODUCTION_NETWORKS : TEST_NETWORKS;
  const otherNetworks = productionNetworks
    ? TEST_NETWORKS
    : PRODUCTION_NETWORKS;
  const chainId = Object.keys(networks).find(
    (key) => networks[Number(key)]!.cctpDomain.toString() === domain.toString(),
  );
  if (!across.utils.isDefined(chainId)) {
    const chainId = Object.keys(otherNetworks).find(
      (key) =>
        otherNetworks[Number(key)]!.cctpDomain.toString() === domain.toString(),
    );
    if (!across.utils.isDefined(chainId)) {
      throw new Error(`No chainId found for domain: ${domain}`);
    }
    return parseInt(chainId);
  }
  return parseInt(chainId);
}
