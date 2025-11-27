import { ethers } from "ethers";
import { MulticallHandler__factory } from "@across-protocol/contracts";
import {
  SwapBeforeBridgeEvent,
  CallsFailedEvent,
  TransferEvent,
  SwapMetadataEvent,
} from "./model/events";
import {
  BASE_SWAP_BEFORE_BRIDGE_ABI,
  SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI,
  METADATA_EMITTED_ABI,
} from "./model/abis";
import {
  MessageSentLog,
  MintAndWithdrawLog,
  SponsoredDepositForBurnLog,
} from "../data-indexing/adapter/cctp-v2/model";
import { SponsoredOFTSendLog } from "../data-indexing/adapter/oft/model";
import {
  SimpleTransferFlowCompletedLog,
  SwapFlowFinalizedLog,
  SwapFlowInitializedLog,
} from "../data-indexing/model/hyperEvmExecutor";

export class EventDecoder {
  static decodeSwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x646284e396b68ff4b4f34e0aa97bcdb9c100f5b44a20da5c475f627039853841";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      BASE_SWAP_BEFORE_BRIDGE_ABI,
    );

    return events;
  }

  static decodeSpokePoolPeripherySwapBeforeBridgeEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const swapBeforeBridgeEventTopic =
      "0x32da500ab49223322bf87d13ba63ef4e5efd139c75f982183d27f59fc31fb250";
    const events: SwapBeforeBridgeEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      swapBeforeBridgeEventTopic,
      SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI,
    );

    return events;
  }

  static decodeCallsFailedEvents(receipt: ethers.providers.TransactionReceipt) {
    const callsFailedEventTopic =
      "0x5296f22c5d0413b66d0bf45c479c4e2ca5b278634bdbd028b48e49502105f966";
    const events: CallsFailedEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      callsFailedEventTopic,
      MulticallHandler__factory.abi,
    );

    return events;
  }

  static decodeTransferEvents(receipt: ethers.providers.TransactionReceipt) {
    const transferEventTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ];

    const events: TransferEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      transferEventTopic,
      transferABI,
      true,
    );

    return events;
  }

  static decodeSwapMetadataEvents(
    receipt: ethers.providers.TransactionReceipt,
  ) {
    const metadataEmittedEventTopic =
      "0xc28009f405f9b451f5155492167b1ad5ab376d991bea880cb5049e924e5b823c";
    const events: SwapMetadataEvent[] = this.decodeTransactionReceiptLogs(
      receipt,
      metadataEmittedEventTopic,
      METADATA_EMITTED_ABI,
    );

    return events;
  }

  /**
   * Decode CCTP MessageSent events and optionally specify the address of
   * the contract that emitted the event to avoid naming collisions.
   */
  static decodeCCTPMessageSentEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
    const eventAbi = ["event MessageSent (bytes message)"];
    let events: MessageSentLog[] = EventDecoder.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeCCTPMintAndWithdrawEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    const eventTopic =
      "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63";
    const eventAbi = [
      "event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)",
    ];
    let events: MintAndWithdrawLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeCCTPSponsoredDepositForBurnEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // Taken from https://sepolia.arbiscan.io/tx/0xcb92b553ebf00a2fff5ab04d4966b5a1d4a37afec858308e4d87ef12bea63576#eventlog
    const eventTopic =
      "0x42d1b5f3692944aee65b659fda3e120f817f17d8f2ac9a256f6fc5d642a591fe";
    // ABI fragment for the event
    const eventAbi = [
      "event SponsoredDepositForBurn(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes signature)",
    ];

    let events: SponsoredDepositForBurnLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  static decodeOFTSponsoredSendEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // Taken from https://arbiscan.io/tx/0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a#eventlog#23
    const eventTopic =
      "0x8fb515a2e89f5acfca1124e69e331c2cded0ca216b578ba531720f6841139dbf";
    const eventAbi = [
      "event SponsoredOFTSend(bytes32 indexed quoteNonce, address indexed originSender, bytes32 indexed finalRecipient, bytes32 destinationHandler, uint256 quoteDeadline, uint256 maxBpsToSponsor, uint256 maxUserSlippageBps, bytes32 finalToken, bytes sig)",
    ];

    let events: SponsoredOFTSendLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }

    return events;
  }

  /**
   * Decodes `SimpleTransferFlowCompleted` events from a transaction receipt.
   * This event is emitted by the HyperEVM executor contract when a simple transfer flow is completed.
   * The event topic and ABI are taken from the HyperEVM executor contract.
   * See: https://hyperevmscan.io/tx/0xf72cfb2c0a9f781057cd4f7beca6fc6bd9290f1d73adef1142b8ac1b0ed7186c#eventlog#37
   *
   * @param receipt The transaction receipt to decode events from.
   * @param contractAddress Optional address of the contract that emitted the event to avoid decoding events from other contracts.
   * @returns An array of decoded `SimpleTransferFlowCompletedLog` objects.
   */
  static decodeSimpleTransferFlowCompletedEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // Taken from https://testnet.purrsec.com/tx/0x1bf0dc091249341d0e91380b1c1d7dca683ab1b6773f7fb011b71a3d017a8fc9
    const eventTopic =
      "0xb021c853215aadb12b6fa8afa7b3158201517d9abf7f756cdbb67bd66abc5a1c";
    const eventAbi = [
      "event SimpleTransferFlowCompleted(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint256 evmAmountIn,uint256 bridgingFeesIncurred,uint256 evmAmountSponsored)",
    ];
    let events: SimpleTransferFlowCompletedLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }
    return events;
  }

  static decodeArbitraryActionsExecutedEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // Taken from https://hyperevmscan.io/tx/0x0e07cf92929a5e3c9d18ba28c71bf50b678d357eb9f433ed305ac6ab958f0abb#eventlog#13
    const eventTopic =
      "0xb88fc27be67e678ffb77faf8f8bb00d39b66b4845e4f7ec1e623b0f15abd5213";
    const eventAbi = [
      "event ArbitraryActionsExecuted(bytes32 indexed quoteNonce, address indexed initialToken, uint256 initialAmount, address indexed finalToken, uint256 finalAmount)",
    ];
    let events: any[] = EventDecoder.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }
    return events;
  }

  static decodeFallbackHyperEVMFlowCompletedEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // Taken from https://hyperevmscan.io/tx/0xb940059314450f7f7cb92972182cdf3f5fb5f54aab27c28b7426a78e6fb32d02#eventlog#25
    const eventTopic =
      "0x4755f239bb1b047245415cb917deced72a3ca8baebcef109c396ff332ea6f50f";
    const eventAbi = [
      "event FallbackHyperEVMFlowCompleted(bytes32 indexed quoteNonce, address indexed finalRecipient, address indexed finalToken, uint256 evmAmountIn, uint256 bridgingFeesIncurred, uint256 evmAmountSponsored)",
    ];
    let events: any[] = EventDecoder.decodeTransactionReceiptLogs(
      receipt,
      eventTopic,
      eventAbi,
    );
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }
    return events;
  }

  /**
   * Decodes `SwapFlowInitialized` events from a transaction receipt.
   * This event is emitted by the HyperEVM executor contract when a swap flow is initialized.
   *
   * @param receipt The transaction receipt to decode events from.
   * @param contractAddress Optional address of the contract that emitted the event to avoid decoding events from other contracts.
   * @returns An array of decoded `SwapFlowInitializedLog` objects.
   */
  static decodeSwapFlowInitializedEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // TODO: Change the event topic once we have the correct one. This is just a placeholder.
    const eventTopic =
      "0x8f7c9e99276d4943f338779695034c44dd3f790c604b9319808a7337c76cc782";
    const eventAbi = [
      "event SwapFlowInitialized(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint256 evmAmountIn,uint256 bridgingFeesIncurred,uint256 coreAmountIn,uint64 minAmountToSend,uint64 maxAmountToSend)",
    ];
    let events: SwapFlowInitializedLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }
    return events;
  }

  /**
   * Decodes `SwapFlowFinalized` events from a transaction receipt.
   * This event is emitted by the HyperEVM executor contract when a swap flow is finalized.
   *
   * @param receipt The transaction receipt to decode events from.
   * @param contractAddress Optional address of the contract that emitted the event to avoid decoding events from other contracts.
   * @returns An array of decoded `SwapFlowFinalizedLog` objects.
   */
  static decodeSwapFlowFinalizedEvents(
    receipt: ethers.providers.TransactionReceipt,
    contractAddress?: string,
  ) {
    // The event topic for SwapFlowFinalized.
    // TODO: Change this event topic once we have events on the hyperEVM blockchain
    const eventTopic =
      "0x2649b068b54881f148d79a785233588975b95874c56852afee4f04c64a504261";
    const eventAbi = [
      "event SwapFlowFinalized(bytes32 indexed quoteNonce,address indexed finalRecipient,address indexed finalToken,uint64 totalSent,uint256 evmAmountSponsored)",
    ];
    let events: SwapFlowFinalizedLog[] =
      EventDecoder.decodeTransactionReceiptLogs(receipt, eventTopic, eventAbi);
    if (contractAddress) {
      events = events.filter((event) => event.address === contractAddress);
    }
    return events;
  }

  static decodeTransactionReceiptLogs(
    receipt: ethers.providers.TransactionReceipt,
    eventTopic: string,
    abi: any,
    skipEmptyLogs: boolean = false,
  ) {
    const events: (ethers.providers.Log & { args: any })[] = [];

    for (const log of receipt.logs) {
      const contractInterface = new ethers.utils.Interface(abi);

      if (log.topics.length === 0 || (log.data === "0x" && skipEmptyLogs))
        continue;

      try {
        const parsedLog = contractInterface.parseLog(log);
        if (parsedLog && log.topics[0] === eventTopic) {
          events.push({ ...log, args: parsedLog.args });
        }
      } catch (e: any) {
        if (e.reason === "no matching event" && e.code === "INVALID_ARGUMENT") {
          continue;
        } else {
          throw e;
        }
      }
    }

    return events;
  }
}
