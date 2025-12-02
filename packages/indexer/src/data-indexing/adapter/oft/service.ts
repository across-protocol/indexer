import { CHAIN_IDs } from "@across-protocol/constants";

// Taken from sample tx: https://layerzeroscan.com/tx/0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a
export const SPONSORED_OFT_SRC_PERIPHERY_ADDRESS: { [key: number]: string } = {
  [CHAIN_IDs.ARBITRUM]: "0x1235Ac1010FeeC8ae22744f323416cBBE37feDbE",
};

export type OftTokenKey = "usdt0";

const OFT_SUPPORTED_CHAINS: Record<
  number,
  {
    endpointId: number;
    tokens: {
      key: OftTokenKey;
      adapter: string;
      token: string;
      startBlockNumber: number;
    }[];
  }
> = {
  [CHAIN_IDs.ARBITRUM]: {
    endpointId: 30110,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92",
        token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        startBlockNumber: 385700000,
      },
    ],
  },
  [CHAIN_IDs.HYPEREVM]: {
    endpointId: 30367,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x904861a24F30EC96ea7CFC3bE9EA4B476d237e98",
        token: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
        startBlockNumber: 15500000,
      },
    ],
  },
  [CHAIN_IDs.MAINNET]: {
    endpointId: 30101,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee",
        token: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        startBlockNumber: 23400000,
      },
    ],
  },
  [CHAIN_IDs.MONAD]: {
    endpointId: 30390,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x9151434b16b9763660705744891fA906F660EcC5",
        token: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D",
        startBlockNumber: 35000000,
      },
    ],
  },
  [CHAIN_IDs.PLASMA]: {
    endpointId: 30383,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x02ca37966753bDdDf11216B73B16C1dE756A7CF9",
        token: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
        startBlockNumber: 2500000,
      },
    ],
  },
  [CHAIN_IDs.POLYGON]: {
    endpointId: 30109,
    tokens: [
      {
        key: "usdt0",
        adapter: "0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13",
        token: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        startBlockNumber: 77200000,
      },
    ],
  },
};

export function getChainIdForEndpointId(endpointId: number) {
  const chainId = Object.keys(OFT_SUPPORTED_CHAINS).find(
    (chainId) =>
      OFT_SUPPORTED_CHAINS[Number(chainId)]!.endpointId === endpointId,
  );
  if (!chainId) {
    throw new Error(`EndpointId ${endpointId} not found`);
  }
  return Number(chainId);
}

export function isEndpointIdSupported(endpointId: number) {
  return Object.keys(OFT_SUPPORTED_CHAINS).some(
    (chainId) =>
      OFT_SUPPORTED_CHAINS[Number(chainId)]!.endpointId === endpointId,
  );
}

export function getSupportOftChainIds() {
  return Object.keys(OFT_SUPPORTED_CHAINS).map((chainId) => Number(chainId));
}

export function getCorrespondingTokenAddress(
  originChainId: number,
  originTokenAddress: string,
  destinationChainId: number,
) {
  const originTokenKey = OFT_SUPPORTED_CHAINS[originChainId]!.tokens.find(
    (token) => token.token === originTokenAddress,
  )?.key;
  if (!originTokenKey) {
    throw new Error(`Origin token address ${originTokenAddress} not found`);
  }
  const destinationTokenAddress = OFT_SUPPORTED_CHAINS[
    destinationChainId
  ]!.tokens.find((token) => token.key === originTokenKey)?.token;
  if (!destinationTokenAddress) {
    throw new Error(`Destination token key ${originTokenKey} not found`);
  }
  return destinationTokenAddress;
}

export function getOftChainConfiguration(chainId: number) {
  const chainConfiguration = OFT_SUPPORTED_CHAINS[chainId];
  if (!chainConfiguration) {
    throw new Error(`ChainId ${chainId} not found`);
  }
  return chainConfiguration;
}
