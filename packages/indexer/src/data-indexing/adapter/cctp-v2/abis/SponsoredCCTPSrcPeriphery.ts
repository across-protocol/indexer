export const SponsoredCCTPSrcPeripheryABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_cctpTokenMessenger",
        type: "address",
      },
      {
        internalType: "uint32",
        name: "_sourceDomain",
        type: "uint32",
      },
      {
        internalType: "address",
        name: "_signer",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "InvalidDeadline",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidNonce",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidSignature",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidSourceDomain",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "nonce",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "depositor",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "finalRecipient",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "maxBpsToSponsor",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "maxUserSlippageBps",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "finalToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "SponsoredDepositForBurn",
    type: "event",
  },
  {
    inputs: [],
    name: "cctpTokenMessenger",
    outputs: [
      {
        internalType: "contract ITokenMessengerV2",
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
        components: [
          {
            internalType: "bytes32",
            name: "nonce",
            type: "bytes32",
          },
          {
            internalType: "uint32",
            name: "sourceDomain",
            type: "uint32",
          },
          {
            internalType: "address",
            name: "finalRecipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "maxBpsToSponsor",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "maxUserSlippageBps",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "finalToken",
            type: "address",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
              },
              {
                internalType: "uint32",
                name: "destinationDomain",
                type: "uint32",
              },
              {
                internalType: "bytes32",
                name: "mintRecipient",
                type: "bytes32",
              },
              {
                internalType: "address",
                name: "burnToken",
                type: "address",
              },
              {
                internalType: "bytes32",
                name: "destinationCaller",
                type: "bytes32",
              },
              {
                internalType: "uint256",
                name: "maxFee",
                type: "uint256",
              },
              {
                internalType: "uint32",
                name: "minFinalityThreshold",
                type: "uint32",
              },
              {
                internalType: "bytes",
                name: "hookData",
                type: "bytes",
              },
            ],
            internalType: "struct SponsoredCCTPInterface.DepositForBurnData",
            name: "depositForBurnData",
            type: "tuple",
          },
        ],
        internalType: "struct SponsoredCCTPInterface.SponsoredCCTPQuote",
        name: "quote",
        type: "tuple",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "depositForBurn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_signer",
        type: "address",
      },
    ],
    name: "setSigner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "signer",
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
    name: "sourceDomain",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "usedNonces",
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
] as const;
