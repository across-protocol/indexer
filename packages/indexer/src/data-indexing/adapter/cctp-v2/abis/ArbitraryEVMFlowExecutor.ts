export const ArbitraryEVMFlowExecutorABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "quoteNonce",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "initialToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "initialAmount",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "finalToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "finalAmount",
        type: "uint256",
      },
    ],
    name: "ArbitraryActionsExecuted",
    type: "event",
  },
] as const;
