import { entities } from "@repo/indexer-database";

export const DepositFields = [
  `deposit.id::integer as "id"`,
  `deposit."relayHash"::varchar as "relayHash"`,
  `deposit."depositId"::decimal as "depositId"`,
  `deposit."originChainId"::bigint as "originChainId"`,
  `deposit."destinationChainId"::bigint as "destinationChainId"`,
  `deposit.depositor::varchar as "depositor"`,
  `deposit.recipient::varchar as "recipient"`,
  `deposit."inputToken"::varchar as "inputToken"`,
  `deposit."inputAmount"::varchar as "inputAmount"`,
  `deposit."outputToken"::varchar as "outputToken"`,
  `(SELECT sm.address::varchar FROM "evm"."swap_metadata" sm WHERE sm."relayHashInfoId" = rhi.id AND sm.side = '${entities.SwapSide.DESTINATION_SWAP}'::"evm"."swap_metadata_side_enum" AND sm."deletedAt" IS NULL ORDER BY sm.id ASC LIMIT 1)::varchar as "swapOutputToken"`,
  `(SELECT sm."minAmountOut"::varchar FROM "evm"."swap_metadata" sm WHERE sm."relayHashInfoId" = rhi.id AND sm.side = '${entities.SwapSide.DESTINATION_SWAP}'::"evm"."swap_metadata_side_enum" AND sm."deletedAt" IS NULL ORDER BY sm.id ASC LIMIT 1)::varchar as "swapOutputTokenAmount"`,
  `deposit."outputAmount"::varchar as "outputAmount"`,
  `deposit.message::varchar as "message"`,
  `deposit."messageHash"::varchar as "messageHash"`,
  `deposit."exclusiveRelayer"::varchar as "exclusiveRelayer"`,
  `deposit."exclusivityDeadline"::timestamp as "exclusivityDeadline"`,
  `deposit."fillDeadline"::timestamp as "fillDeadline"`,
  `deposit."quoteTimestamp"::timestamp as "quoteTimestamp"`,
  `deposit."transactionHash"::varchar as "depositTxHash"`, // Renamed field
  `deposit."blockNumber"::integer as "depositBlockNumber"`,
  `deposit."blockTimestamp"::timestamp as "depositBlockTimestamp"`,
  `NULL::integer as "destinationDomain"`,
];

export const RelayHashInfoFields = [
  `rhi.status::varchar as "status"`,
  `rhi."depositRefundTxHash"::varchar as "depositRefundTxHash"`,
  `rhi."swapTokenPriceUsd"::decimal as "swapTokenPriceUsd"`,
  `rhi."swapFeeUsd"::decimal as "swapFeeUsd"`,
  `rhi."bridgeFeeUsd"::decimal as "bridgeFeeUsd"`,
  `rhi."inputPriceUsd"::decimal as "inputPriceUsd"`,
  `rhi."outputPriceUsd"::decimal as "outputPriceUsd"`,
  `rhi."fillGasFee"::decimal as "fillGasFee"`,
  `rhi."fillGasFeeUsd"::decimal as "fillGasFeeUsd"`,
  `rhi."fillGasTokenPriceUsd"::decimal as "fillGasTokenPriceUsd"`,
  `CASE 
    WHEN rhi."includedActions" = true AND rhi.status = 'filled' THEN (rhi."callsFailedEventId" IS NULL)
    ELSE NULL::boolean
  END::boolean as "actionsSucceeded"`,
  `rhi."actionsTargetChainId"::bigint as "actionsTargetChainId"`,
];

export const FilledRelayFields = [
  `fill.relayer::varchar as "relayer"`,
  `fill."blockTimestamp"::timestamp as "fillBlockTimestamp"`,
  `fill."transactionHash"::varchar as "fillTx"`, // Renamed field
];

export const SwapBeforeBridgeFields = [
  `swap."transactionHash"::varchar as "swapTransactionHash"`,
  `swap."swapToken"::varchar as "swapToken"`,
  `swap."swapTokenAmount"::varchar as "swapTokenAmount"`,
];

export const DepositForBurnFields = [
  `"depositForBurn".id::integer as "id"`,
  `NULL::varchar as "relayHash"`,
  `NULL::decimal as "depositId"`,
  `"depositForBurn"."chainId"::bigint as "originChainId"`,
  `"mintAndWithdraw"."chainId"::bigint as "destinationChainId"`,
  `"depositForBurn".depositor::varchar as "depositor"`,
  `"depositForBurn"."mintRecipient"::varchar as "recipient"`,
  `"depositForBurn"."burnToken"::varchar as "inputToken"`,
  `"depositForBurn"."amount"::varchar as "inputAmount"`,
  `"mintAndWithdraw"."mintToken"::varchar as "outputToken"`,
  `NULL::varchar as "swapOutputToken"`,
  `NULL::varchar as "swapOutputTokenAmount"`,
  `"mintAndWithdraw"."amount"::varchar as "outputAmount"`,
  `"depositForBurn"."hookData"::varchar as "message"`,
  `NULL::varchar as "messageHash"`,
  `NULL::varchar as "exclusiveRelayer"`,
  `NULL::timestamp as "exclusivityDeadline"`,
  `NULL::timestamp as "fillDeadline"`,
  `"depositForBurn"."blockTimestamp"::timestamp as "quoteTimestamp"`,
  `"depositForBurn"."transactionHash"::varchar as "depositTxHash"`,
  `"depositForBurn"."blockNumber"::integer as "depositBlockNumber"`,
  `"depositForBurn"."blockTimestamp"::timestamp as "depositBlockTimestamp"`,
  `"depositForBurn"."destinationDomain"::integer as "destinationDomain"`,
];

export const DepositForBurnRelayHashInfoFields = [
  `NULL::varchar as "status"`,
  `NULL::varchar as "depositRefundTxHash"`,
  `NULL::decimal as "swapTokenPriceUsd"`,
  `NULL::decimal as "swapFeeUsd"`,
  `NULL::decimal as "bridgeFeeUsd"`,
  `NULL::decimal as "inputPriceUsd"`,
  `NULL::decimal as "outputPriceUsd"`,
  `NULL::decimal as "fillGasFee"`,
  `NULL::decimal as "fillGasFeeUsd"`,
  `NULL::decimal as "fillGasTokenPriceUsd"`,
  `NULL::boolean as "actionsSucceeded"`,
  `NULL::bigint as "actionsTargetChainId"`,
];

export const DepositForBurnFilledRelayFields = [
  `NULL::varchar as "relayer"`,
  `"mintAndWithdraw"."blockTimestamp"::timestamp as "fillBlockTimestamp"`,
  `"mintAndWithdraw"."transactionHash"::varchar as "fillTx"`,
];

export const DepositForBurnSwapBeforeBridgeFields = [
  `NULL::varchar as "swapTransactionHash"`,
  `NULL::varchar as "swapToken"`,
  `NULL::varchar as "swapTokenAmount"`,
];

export const OftSentFields = [
  `"oftSent".id::integer as "id"`,
  `NULL::varchar as "relayHash"`,
  `NULL::decimal as "depositId"`,
  `"oftSent"."chainId"::bigint as "originChainId"`,
  `"oftReceived"."chainId"::bigint as "destinationChainId"`,
  `"oftSent"."fromAddress"::varchar as "depositor"`,
  `"oftSent"."fromAddress"::varchar as "recipient"`,
  `"oftSent"."token"::varchar as "inputToken"`,
  `"oftSent"."amountSentLD"::varchar as "inputAmount"`,
  `"oftReceived"."token"::varchar as "outputToken"`,
  `NULL::varchar as "swapOutputToken"`,
  `NULL::varchar as "swapOutputTokenAmount"`,
  `"oftReceived"."amountReceivedLD"::varchar as "outputAmount"`,
  `NULL::varchar as "message"`,
  `NULL::varchar as "messageHash"`,
  `NULL::varchar as "exclusiveRelayer"`,
  `NULL::timestamp as "exclusivityDeadline"`,
  `NULL::timestamp as "fillDeadline"`,
  `"oftSent"."blockTimestamp"::timestamp as "quoteTimestamp"`,
  `"oftSent"."transactionHash"::varchar as "depositTxHash"`,
  `"oftSent"."blockNumber"::integer as "depositBlockNumber"`,
  `"oftSent"."blockTimestamp"::timestamp as "depositBlockTimestamp"`,
  `NULL::integer as "destinationDomain"`,
  `"oftSent"."dstEid"::integer as "destinationEndpointId"`,
];

export const OftSentRelayHashInfoFields = [
  `NULL::varchar as "status"`,
  `NULL::varchar as "depositRefundTxHash"`,
  `NULL::decimal as "swapTokenPriceUsd"`,
  `NULL::decimal as "swapFeeUsd"`,
  `NULL::decimal as "bridgeFeeUsd"`,
  `NULL::decimal as "inputPriceUsd"`,
  `NULL::decimal as "outputPriceUsd"`,
  `NULL::decimal as "fillGasFee"`,
  `NULL::decimal as "fillGasFeeUsd"`,
  `NULL::decimal as "fillGasTokenPriceUsd"`,
  `NULL::boolean as "actionsSucceeded"`,
  `NULL::bigint as "actionsTargetChainId"`,
];

export const OftSentFilledRelayFields = [
  `NULL::varchar as "relayer"`,
  `"oftReceived"."blockTimestamp"::timestamp as "fillBlockTimestamp"`,
  `"oftReceived"."transactionHash"::varchar as "fillTx"`,
];

export const OftSentSwapBeforeBridgeFields = [
  `NULL::varchar as "swapTransactionHash"`,
  `NULL::varchar as "swapToken"`,
  `NULL::varchar as "swapTokenAmount"`,
];
