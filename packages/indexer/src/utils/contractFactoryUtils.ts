import { CHAIN_IDs } from "@across-protocol/constants";
import { clients } from "@across-protocol/sdk";
import { Logger } from "winston";
import { getMaxBlockLookBack } from "../web3/constants";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import {
  getConfigStoreClient,
  getHubPoolClient,
  getSpokeClient,
} from "./contractUtils";

abstract class ContractClientFactory<
  ClientType,
  RequiredFactories = undefined,
  GetOverrides = undefined,
> {
  constructor(
    protected readonly retryProviderFactory: RetryProvidersFactory,
    protected readonly logger: Logger,
    protected readonly requiredFactories: RequiredFactories,
  ) {
    logger.debug({
      at: "Indexer#ContractClientFactory#constructor",
      message: "Initializing contract client factory",
      factory: this.constructor.name,
    });
  }

  abstract get(
    chainId: number,
    fromBlock?: number,
    toBlock?: number,
    overrides?: GetOverrides,
  ): ClientType;
}

export class ConfigStoreClientFactory extends ContractClientFactory<clients.AcrossConfigStoreClient> {
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
  ): clients.AcrossConfigStoreClient {
    // FIXME: hardcoded chain id to represent mainnet
    const chainId = CHAIN_IDs.MAINNET;

    const provider = this.retryProviderFactory.getProviderForChainId(chainId);
    return getConfigStoreClient({
      provider,
      logger: this.logger,
      maxBlockLookBack: getMaxBlockLookBack(chainId),
      chainId,
    });
  }
}

type HubPoolFactoryRequiredFactories = {
  configStoreClientFactory: ConfigStoreClientFactory;
};
type HubPoolFactoryGetFunctionOverrides = {
  configStoreClient: clients.AcrossConfigStoreClient;
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
      configStoreClient: clients.AcrossConfigStoreClient;
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
      );
    return getHubPoolClient({
      provider: this.retryProviderFactory.getProviderForChainId(chainId),
      logger: this.logger,
      maxBlockLookBack: getMaxBlockLookBack(chainId),
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
  hubPoolClient: clients.HubPoolClient;
};
export class SpokePoolClientFactory extends ContractClientFactory<
  clients.SpokePoolClient,
  SpokeFactoryRequiredFactories,
  SpokeFactoryGetFunctionOverrides
> {
  constructor(
    retryProviderFactory: RetryProvidersFactory,
    logger: Logger,
    requiredFactories: SpokeFactoryRequiredFactories,
  ) {
    super(retryProviderFactory, logger, requiredFactories);
  }
  get(
    chainId: number,
    fromBlock?: number,
    toBlock?: number,
    overrides?: {
      disableQuoteBlockLookup?: boolean;
      hubPoolClient: clients.HubPoolClient;
    },
  ): clients.SpokePoolClient {
    const hubPoolClient =
      overrides?.hubPoolClient ??
      this.requiredFactories.hubPoolClientFactory.get(
        CHAIN_IDs.MAINNET, // FIXME: hardcoded chain id to represent mainnet
        undefined, // We need to instantiate the hub pool from genesis
        toBlock,
      );

    return getSpokeClient({
      provider: this.retryProviderFactory.getProviderForChainId(chainId),
      logger: this.logger,
      maxBlockLookBack: getMaxBlockLookBack(chainId),
      chainId,
      hubPoolClient,
      fromBlock,
      toBlock,
      disableQuoteBlockLookup: overrides?.disableQuoteBlockLookup,
    });
  }
}
