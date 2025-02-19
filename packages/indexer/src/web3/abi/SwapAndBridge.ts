export const SwapAndBridgeAbi = [
  {
    inputs: [
      {
        internalType: "contract V3SpokePoolInterface",
        name: "_spokePool",
        type: "address",
      },
      {
        internalType: "address",
        name: "_exchange",
        type: "address",
      },
      {
        internalType: "bytes4[]",
        name: "_allowedSelectors",
        type: "bytes4[]",
      },
      {
        internalType: "contract IERC20",
        name: "_swapToken",
        type: "address",
      },
      {
        internalType: "contract IERC20",
        name: "_acrossInputToken",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "InvalidFunctionSelector",
    type: "error",
  },
  {
    inputs: [],
    name: "LeftoverSrcTokens",
    type: "error",
  },
  {
    inputs: [],
    name: "MinimumExpectedInputAmount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "exchange",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "swapToken",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "acrossInputToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "swapTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "acrossInputAmount",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "acrossOutputToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "acrossOutputAmount",
        type: "uint256",
      },
    ],
    name: "SwapBeforeBridge",
    type: "event",
  },
  {
    inputs: [],
    name: "ACROSS_INPUT_TOKEN",
    outputs: [
      {
        internalType: "contract IERC20",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "EXCHANGE",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SPOKE_POOL",
    outputs: [
      {
        internalType: "contract V3SpokePoolInterface",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SWAP_TOKEN",
    outputs: [
      {
        internalType: "contract IERC20",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "",
        type: "bytes4",
      },
    ],
    name: "allowedSelectors",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes[]",
        name: "data",
        type: "bytes[]",
      },
    ],
    name: "multicall",
    outputs: [
      {
        internalType: "bytes[]",
        name: "results",
        type: "bytes[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "routerCalldata",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "swapTokenAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minExpectedInputTokenAmount",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "outputToken",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "outputAmount",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "depositor",
            type: "address",
          },
          {
            internalType: "address",
            name: "recipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "destinationChainid",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "exclusiveRelayer",
            type: "address",
          },
          {
            internalType: "uint32",
            name: "quoteTimestamp",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "fillDeadline",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "exclusivityDeadline",
            type: "uint32",
          },
          {
            internalType: "bytes",
            name: "message",
            type: "bytes",
          },
        ],
        internalType: "struct SwapAndBridgeBase.DepositData",
        name: "depositData",
        type: "tuple",
      },
    ],
    name: "swapAndBridge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
