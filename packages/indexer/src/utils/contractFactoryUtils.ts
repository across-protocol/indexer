import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import { clients, providers, utils } from "@across-protocol/sdk";

import { getMaxBlockLookBack } from "../web3/constants";
import {
  RetryProvidersFactory,
  SvmProvider,
} from "../web3/RetryProvidersFactory";
import {
  getConfigStoreClient,
  getHubPoolClient,
  getEvmSpokeClient,
  getSvmSpokeClient,
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

abstract class AsyncContractClientFactory<
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
  ): Promise<ClientType>;
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

    const provider = this.retryProviderFactory.getProviderForChainId(
      chainId,
    ) as providers.RetryProvider;
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
      provider: this.retryProviderFactory.getProviderForChainId(
        chainId,
      ) as providers.RetryProvider,
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
export class SpokePoolClientFactory extends AsyncContractClientFactory<
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

  async get(
    chainId: number,
    fromBlock?: number,
    toBlock?: number,
    overrides?: {
      disableQuoteBlockLookup?: boolean;
      hubPoolClient: clients.HubPoolClient;
      maxBlockLookback?: number;
    },
    enableCaching = true,
  ): Promise<clients.SpokePoolClient> {
    const hubPoolClient =
      overrides?.hubPoolClient ??
      this.requiredFactories.hubPoolClientFactory.get(
        CHAIN_IDs.MAINNET, // FIXME: hardcoded chain id to represent mainnet
        undefined, // We need to instantiate the hub pool from genesis
        toBlock,
      );

    const maxBlockLookBack =
      overrides?.maxBlockLookback ?? getMaxBlockLookBack(chainId);
    const provider = enableCaching
      ? this.retryProviderFactory.getProviderForChainId(chainId)
      : this.retryProviderFactory.getCustomEvmProvider({
          chainId,
          enableCaching: false,
        });

    if (utils.chainIsEvm(chainId)) {
      return getEvmSpokeClient({
        provider: provider as providers.RetryProvider,
        logger: this.logger,
        maxBlockLookBack,
        chainId,
        hubPoolClient,
        fromBlock,
        toBlock,
        disableQuoteBlockLookup: overrides?.disableQuoteBlockLookup,
      });
    }

    if (utils.chainIsSvm(chainId)) {
      return getSvmSpokeClient({
        provider: provider as SvmProvider,
        logger: this.logger,
        chainId,
        maxBlockLookBack,
        fromBlock,
        toBlock,
        hubPoolClient,
        disableQuoteBlockLookup: overrides?.disableQuoteBlockLookup,
      });
    }

    throw new Error(`Chain ${chainId} is not an EVM or SVM chain`);
  }
}

export function initializeContractFactories(
  retryProviderFactory: RetryProvidersFactory,
  logger: Logger,
): {
  configStoreClientFactory: ConfigStoreClientFactory;
  hubPoolClientFactory: HubPoolClientFactory;
  spokePoolClientFactory: SpokePoolClientFactory;
} {
  const configStoreClientFactory = new ConfigStoreClientFactory(
    retryProviderFactory,
    logger,
    undefined,
  );
  const hubPoolClientFactory = new HubPoolClientFactory(
    retryProviderFactory,
    logger,
    { configStoreClientFactory },
  );
  const spokePoolClientFactory = new SpokePoolClientFactory(
    retryProviderFactory,
    logger,
    { hubPoolClientFactory },
  );
  return { configStoreClientFactory, hubPoolClientFactory, spokePoolClientFactory };
}
  