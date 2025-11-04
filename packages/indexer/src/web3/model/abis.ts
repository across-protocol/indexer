// @note: This ABI is no longer exported from the contracts repo
export const BASE_SWAP_BEFORE_BRIDGE_ABI = [
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
];

// @note: There's an issue with the exported version of this ABI from the contracts repo
// To avoid error logs I'm defining it here instead
export const SPOKE_POOL_PERIPHERY_SWAP_BEFORE_BRIDGE_ABI = [
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
        indexed: false,
        internalType: "bytes",
        name: "exchangeCalldata",
        type: "bytes",
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
        internalType: "bytes32",
        name: "acrossOutputToken",
        type: "bytes32",
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
];

export const METADATA_EMITTED_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "MetadataEmitted",
    type: "event",
  },
];
