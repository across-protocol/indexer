import {
  CCTP_NO_DOMAIN,
  CHAIN_IDs,
  PRODUCTION_NETWORKS,
  PUBLIC_NETWORKS,
  TEST_NETWORKS,
} from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";
import axios from "axios";
import { BigNumber, ethers } from "ethers";
import {
  DecodedHyperCoreWithdrawalHookData,
  DecodedMessageBody,
} from "./model";

// we need to fetch only recent events, so
// roughly starting with date of Oct 1st, 2025
const STARTING_BLOCK_NUMBERS = {
  [CHAIN_IDs.ARBITRUM]: 384463853,
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: 200000000,
  [CHAIN_IDs.BASE]: 36193725,
  [CHAIN_IDs.HYPEREVM]: 15083577,
  [CHAIN_IDs.INK]: 26328532,
  [CHAIN_IDs.LINEA]: 26258551,
  [CHAIN_IDs.MAINNET]: 23474786,
  [CHAIN_IDs.MONAD]: 35000000,
  [CHAIN_IDs.OPTIMISM]: 141788893,
  [CHAIN_IDs.POLYGON]: 77089546,
  [CHAIN_IDs.UNICHAIN]: 28500000,
  [CHAIN_IDs.WORLD_CHAIN]: 19873068,
  [CHAIN_IDs.SOLANA]: 370390000,
};

export function getIndexingStartBlockNumber(chainId: number) {
  const blockNumber = STARTING_BLOCK_NUMBERS[chainId];
  if (!blockNumber) {
    throw new Error(
      `No starting block number found for CCTP indexing on chainId: ${chainId}`,
    );
  }
  return blockNumber;
}

/**
 * Converts a 32-byte hex string with padding to a standard ETH address.
 * @param bytes32 The 32-byte hex string to convert.
 * @returns The ETH address representation of the 32-byte hex string.
 */
export function cctpBytes32ToAddress(bytes32: string): string {
  // Grab the last 20 bytes of the 32-byte hex string
  return ethers.utils.getAddress(ethers.utils.hexDataSlice(bytes32, 12));
}

export function decodeMessage(messageBytesArray: Uint8Array) {
  // Source: https://developers.circle.com/stablecoins/message-format
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

/**
 * @notice Returns the CCTP domain for a given chain ID. Throws if the chain ID is not a CCTP domain.
 * @param chainId
 * @returns CCTP Domain ID
 */
export function getCctpDomainForChainId(chainId: number): number {
  const cctpDomain = PUBLIC_NETWORKS[chainId]?.cctpDomain;
  if (!across.utils.isDefined(cctpDomain) || cctpDomain === CCTP_NO_DOMAIN) {
    throw new Error(`No CCTP domain found for chainId: ${chainId}`);
  }
  return cctpDomain;
}

/**
 * @notice Checks if a given chain ID is a production (mainnet) network.
 * @param chainId The chain ID to check
 * @returns true if the chain is a production network, false if it's a test network
 */
export function isProductionNetwork(chainId: number): boolean {
  return chainId in PRODUCTION_NETWORKS;
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

export type CCTPV2APIGetAttestationResponse = {
  messages: CCTPV2APIAttestation[];
};

export type CCTPV2APIAttestation = {
  eventNonce: string;
  status: string;
  attestation: string;
  message: string;
};

export async function fetchAttestationsForTxn(
  sourceDomainId: number,
  transactionHash: string,
  isMainnet: boolean,
): Promise<CCTPV2APIGetAttestationResponse> {
  const httpResponse = await axios.get<CCTPV2APIGetAttestationResponse>(
    `https://iris-api${
      isMainnet ? "" : "-sandbox"
    }.circle.com/v2/messages/${sourceDomainId}?transactionHash=${transactionHash}`,
  );
  return httpResponse.data;
}

/**
 * Decodes the hookData from DepositForBurn and MessageReceived events.
 *
 * This function manually parses a concatenated byte string using Ethers.js v5 utilities.
 *
 * @param {string} hookDataHex The raw hook data as a hex string (e.g., from decodeMessageBody).
 * @returns {DecodedHyperCoreWithdrawalHookData | null} A structured object with the decoded data, or null on failure.
 *
 * @schema
 * Bytes 0-23:  bytes24 - Magic bytes "cctp-forward" or 0 if not forwarding
 * Bytes 24-27: uint32  - CrossChainWithdrawal Hook Data Version ID (0)
 * Bytes 28-31: uint32  - Length of CrossChainWithdrawal Hook Data (fromAddress + nonce + userData)
 * Bytes 32-51: address - from address (20 bytes)
 * Bytes 52-59: uint64  - HyperCore nonce (8 bytes)
 * Bytes 60+:   bytes   - The user provided hook data
 */
export function decodeHookData(
  hookDataHex: string,
): DecodedHyperCoreWithdrawalHookData | null {
  try {
    // Convert hex string to a byte array for slicing
    const hookDataBytes = ethers.utils.arrayify(hookDataHex);

    // Define byte offsets for each field
    const MAGIC_BYTES_END = 24;
    const VERSION_ID_END = 28; // 24 + 4
    const DECLARED_LENGTH_END = 32; // 28 + 4
    const FROM_ADDRESS_END = 52; // 32 + 20
    const NONCE_END = 60; // 52 + 8
    // userData is from byte 60 to the end

    // Minimum length for the fixed part of the hookData (all fields before userData)
    const MIN_HOOK_DATA_LENGTH = 60;

    if (hookDataBytes.length < MIN_HOOK_DATA_LENGTH) {
      return null;
    }

    // Slice and parse magic bytes
    const magicBytes = ethers.utils.hexlify(
      hookDataBytes.slice(0, MAGIC_BYTES_END),
    );

    // Slice and parse version ID (uint32)
    const versionId = Number(
      ethers.utils.hexlify(
        hookDataBytes.slice(MAGIC_BYTES_END, VERSION_ID_END),
      ),
    );

    // Slice and parse the declared length of the data
    const declaredLength = Number(
      ethers.utils.hexlify(
        hookDataBytes.slice(VERSION_ID_END, DECLARED_LENGTH_END),
      ),
    );

    // Validate the declared length against the actual data length
    // The declared length should match the bytes remaining after the length field (DECLARED_LENGTH_END)
    if (hookDataBytes.length - DECLARED_LENGTH_END !== declaredLength) {
      return null;
    }

    // Slice and parse fromAddress (20-byte address)
    const fromAddressHex = ethers.utils.hexlify(
      hookDataBytes.slice(DECLARED_LENGTH_END, FROM_ADDRESS_END),
    );
    // Convert to checksummed address format
    const fromAddress = ethers.utils.getAddress(fromAddressHex);

    // Slice and parse HyperCore nonce (uint64)
    const hyperCoreNonce = BigNumber.from(
      ethers.utils.hexlify(hookDataBytes.slice(FROM_ADDRESS_END, NONCE_END)),
    );

    // The remaining bytes are the user-provided hook data
    const userData = ethers.utils.hexlify(hookDataBytes.slice(NONCE_END));

    return {
      fromAddress,
      hyperCoreNonce,
      versionId,
      declaredLength,
      magicBytes,
      userData,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Decodes the concatenated messageBody from a MessageReceived event.
 *
 * This function manually parses a concatenated byte string using Ethers.js v5 utilities.
 *
 * @param {string} messageBody The raw message body as a hex string (must start with '0x').
 * @returns {DecodedMessageBody | null} A structured object with the decoded data, or null on failure.
 *
 * @schema
 * Field                 Bytes      Type       Index
 * version               4          uint32     0
 * burnToken             32         bytes32    4
 * mintRecipient         32         bytes32    36
 * amount                32         uint256    68
 * messageSender         32         bytes32    100
 * maxFee                32         uint256    132
 * feeExecuted           32         uint256    164
 * expirationBlock       32         uint256    196
 * hookData              dynamic    bytes      228
 */
export function decodeMessageBody(
  messageBody: string,
): DecodedMessageBody | null {
  try {
    if (!messageBody || !messageBody.startsWith("0x")) {
      return null;
    }

    // Convert hex string to a byte array for slicing
    const messageBytesArray = ethers.utils.arrayify(messageBody);

    // Define byte offsets for each field
    const VERSION_END = 4;
    const BURN_TOKEN_END = 36; // 4 + 32
    const MINT_RECIPIENT_END = 68; // 36 + 32
    const AMOUNT_END = 100; // 68 + 32
    const MESSAGE_SENDER_END = 132; // 100 + 32
    const MAX_FEE_END = 164; // 132 + 32
    const FEE_EXECUTED_END = 196; // 164 + 32
    const EXPIRATION_BLOCK_END = 228; // 196 + 32
    // hookData is from byte 228 to the end

    // Check for minimum length (all fixed-length fields)
    if (messageBytesArray.length < EXPIRATION_BLOCK_END) {
      return null;
    }

    // Slice and parse version (uint32)
    const version = Number(
      ethers.utils.hexlify(messageBytesArray.slice(0, VERSION_END)),
    );
    // Slice and parse burnToken (bytes32)
    const burnToken = ethers.utils.hexlify(
      messageBytesArray.slice(VERSION_END, BURN_TOKEN_END),
    );
    // Slice and parse mintRecipient (bytes32)
    const mintRecipient = ethers.utils.hexlify(
      messageBytesArray.slice(BURN_TOKEN_END, MINT_RECIPIENT_END),
    );
    // Slice and parse amount (uint256)
    const amount = BigNumber.from(
      ethers.utils.hexlify(
        messageBytesArray.slice(MINT_RECIPIENT_END, AMOUNT_END),
      ),
    );
    // Slice and parse messageSender (bytes32)
    const messageSender = ethers.utils.hexlify(
      messageBytesArray.slice(AMOUNT_END, MESSAGE_SENDER_END),
    );
    // Slice and parse maxFee (uint256)
    const maxFee = BigNumber.from(
      ethers.utils.hexlify(
        messageBytesArray.slice(MESSAGE_SENDER_END, MAX_FEE_END),
      ),
    );
    // Slice and parse feeExecuted (uint256)
    const feeExecuted = BigNumber.from(
      ethers.utils.hexlify(
        messageBytesArray.slice(MAX_FEE_END, FEE_EXECUTED_END),
      ),
    );
    // Slice and parse expirationBlock (uint256)
    const expirationBlock = BigNumber.from(
      ethers.utils.hexlify(
        messageBytesArray.slice(FEE_EXECUTED_END, EXPIRATION_BLOCK_END),
      ),
    );
    // The remaining bytes are the hookData
    const hookData = ethers.utils.hexlify(
      messageBytesArray.slice(EXPIRATION_BLOCK_END),
    );

    return {
      version,
      burnToken,
      mintRecipient,
      amount,
      messageSender,
      maxFee,
      feeExecuted,
      expirationBlock,
      hookData,
    };
  } catch (error) {
    return null;
  }
}

export interface IsHypercoreWithdrawOptions {
  logger?: {
    warn: (log: {
      at: string;
      message: string;
      transactionHash?: string;
    }) => void;
  };
  chainId?: number;
  transactionHash?: string;
}

export interface HypercoreWithdrawResult {
  isValid: boolean;
  decodedHookData: DecodedHyperCoreWithdrawalHookData | null;
}

/**
 * Validates if a message body represents a valid HyperCore withdrawal.
 * Checks message body version, hook data version, and magic bytes.
 *
 * @param messageBody The raw message body hex string from MessageReceived event
 * @param options Optional logger, chainId, and transactionHash for warning messages
 * @returns Object containing validation result and decoded hook data
 */
export function isHypercoreWithdraw(
  messageBody: string,
  options?: IsHypercoreWithdrawOptions,
): HypercoreWithdrawResult {
  const decodedMessage = decodeMessageBody(messageBody);

  // If we cannot decode the hyperCore withdrawal message, we skip the event
  if (!decodedMessage) {
    return {
      isValid: false,
      decodedHookData: null,
    };
  }

  const isValidMessageBodyVersionId = decodedMessage.version === 1; // We currently only support version 1
  if (!isValidMessageBodyVersionId) {
    if (options?.logger && options?.chainId && options?.transactionHash) {
      options.logger.warn({
        at: "isHypercoreWithdraw",
        message: `Skipping MessageReceived event with unsupported message body version ${decodedMessage.version} on chain ${options.chainId}`,
        transactionHash: options.transactionHash,
      });
    }
    return {
      isValid: false,
      decodedHookData: null,
    };
  }

  const decodedHookData = decodeHookData(decodedMessage.hookData);

  // If we cannot decode the hook data with the expected format, we skip the event
  if (!decodedHookData) {
    return {
      isValid: false,
      decodedHookData: null,
    };
  }

  const isValidHookDataVersionId = decodedHookData.versionId === 0; // We currently only support version 0
  if (!isValidHookDataVersionId) {
    if (options?.logger && options?.chainId && options?.transactionHash) {
      options.logger.warn({
        at: "isHypercoreWithdraw",
        message: `Skipping MessageReceived event with unsupported hook data version ${decodedHookData.versionId} on chain ${options.chainId}`,
        transactionHash: options.transactionHash,
      });
    }
    return {
      isValid: false,
      decodedHookData: null,
    };
  }

  // We are only interested in hyperCore withdrawals which have the "cctp-forward" magic bytes
  const isValidMagicBytes = ethers.utils
    .toUtf8String(ethers.utils.arrayify(decodedHookData.magicBytes))
    .includes("cctp-forward");

  return {
    isValid: isValidMagicBytes,
    decodedHookData,
  };
}
