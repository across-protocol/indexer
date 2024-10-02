import { Logger } from "winston";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { clients } from "@across-protocol/sdk";
import {
  getConfigStoreClient,
  getHubPoolClient,
  getSpokeClient,
} from "./contractUtils";
import { CHAIN_IDs } from "@across-protocol/constants";

// FIXME: we should have more intelligent ways to resolve max lookback
//      : maybe a lookup table per chain like in the constants/bots
function resolveMaxLookback(lookback?: number) {
  return lookback ?? Number.MAX_SAFE_INTEGER;
}

abstract class ContractClientFactory<
  ClientType,
  RequiredFactories = unknown,
  GetOverrides = unknown,
> {
  constructor(
    protected readonly retryProviderFactory: RetryProvidersFactory,
    protected readonly logger: Logger,
    protected readonly requiredFactories: RequiredFactories,
  ) {
    logger.debug({
      message: "Initializing contract client factory",
      factory: this.constructor.name,
      at: "ContractClientFactory#constructor",
    });
  }

  abstract get(
    chainId: number,
    fromBlock?: number,
    toBlock?: number,
    overrides?: GetOverrides,
  ): ClientType;
}

type ConfigStoreFactoryGetFunctionOverrides = {
  maxBlockLookBack: number;
};
export class ConfigStoreClientFactory extends ContractClientFactory<
  clients.AcrossConfigStoreClient,
  undefined,
  ConfigStoreFactoryGetFunctionOverrides
> {
  constructor(
    retryProviderFactory: RetryProvidersFactory,
    logger: Logger,
    requiredFactories: undefined,
  ) {
    super(retryProviderFactory, logger, requiredFactories);
  }

  get(
    _chainId: number, // Unused
    _fromBlock?: number, // Unused
    _toBlock?: number, // Unused
    overrides?: {
      maxBlockLookBack: number;
    },
  ): clients.AcrossConfigStoreClient {
    // FIXME: hardcoded chain id to represent mainnet
    const chainId = CHAIN_IDs.MAINNET;

    const provider = this.retryProviderFactory.getProviderForChainId(chainId);
    return getConfigStoreClient({
      provider,
      logger: this.logger,
      maxBlockLookBack: resolveMaxLookback(overrides?.maxBlockLookBack),
      chainId,
    });
  }
}

type HubPoolFactoryRequiredFactories = {
  configStoreClientFactory: ConfigStoreClientFactory;
};
type HubPoolFactoryGetFunctionOverrides = {
  configStoreClient?: clients.AcrossConfigStoreClient;
  maxBlockLookBack: number;
};
export class HubPoolClientFactory extends ContractClientFactory<
  clients.HubPoolClient,
  HubPoolFactoryRequiredFactories,
  HubPoolFactoryGetFunctionOverrides
> {
  constructor(
    retryProviderFactory: RetryProvidersFactory,
    logger: Logger,
    requiredFactories: HubPoolFactoryRequiredFactories,
  ) {
    super(retryProviderFactory, logger, requiredFactories);
  }
  get(
    _chainId: number, // Unused
    fromBlock?: number,
    toBlock?: number,
    overrides?: {
      configStoreClient?: clients.AcrossConfigStoreClient;
      maxBlockLookBack: number;
    },
  ): clients.HubPoolClient {
    // FIXME: hardcoded chain id to represent mainnet
    const chainId = CHAIN_IDs.MAINNET;

    const configStoreClient =
      overrides?.configStoreClient ??
      this.requiredFactories.configStoreClientFactory.get(
        chainId,
        undefined, // We need to instantiate the config store from genesis
        toBlock,
        {
          maxBlockLookBack: resolveMaxLookback(overrides?.maxBlockLookBack),
        },
      );
    return getHubPoolClient({
      provider: this.retryProviderFactory.getProviderForChainId(chainId),
      logger: this.logger,
      maxBlockLookBack: resolveMaxLookback(overrides?.maxBlockLookBack),
      chainId,
      configStoreClient,
      fromBlock,
      toBlock,
    });
  }
}

type SpokeFactoryRequiredFactories = {
  hubPoolClientFactory: HubPoolClientFactory;
};
type SpokeFactoryGetFunctionOverrides = {
  maxBlockLookBack: number;
  hubPoolClient?: clients.HubPoolClient;
};
export class SpokePoolClientFactory extends ContractClientFactory<
  clients.SpokePoolClient,
  SpokeFactoryRequiredFactories,
  SpokeFactoryGetFunctionOverrides
> {
  get(
    chainId: number,
    fromBlock?: number,
    toBlock?: number,
    overrides?: {
      maxBlockLookBack: number;
      hubPoolClient?: clients.HubPoolClient;
    },
  ): clients.SpokePoolClient {
    const hubPoolClient =
      overrides?.hubPoolClient ??
      this.requiredFactories.hubPoolClientFactory.get(
        CHAIN_IDs.MAINNET, // FIXME: hardcoded chain id to represent mainnet
        undefined, // We need to instantiate the hub pool from genesis
        toBlock,
        {
          maxBlockLookBack: resolveMaxLookback(overrides?.maxBlockLookBack),
        },
      );

    return getSpokeClient({
      provider: this.retryProviderFactory.getProviderForChainId(chainId),
      logger: this.logger,
      maxBlockLookBack: resolveMaxLookback(overrides?.maxBlockLookBack),
      chainId,
      hubPoolClient,
      fromBlock,
      toBlock,
    });
  }
}
