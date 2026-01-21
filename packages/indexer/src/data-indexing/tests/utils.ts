import * as contractUtils from "../../utils/contractUtils";
import sinon from "sinon";
import {
  Repository,
  FindOptionsWhere,
  ObjectLiteral,
  DataSource,
} from "typeorm";
import { expect } from "chai";
import { Logger } from "winston";
import { SpokePoolIndexerDataHandler } from "../service/SpokePoolIndexerDataHandler";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../../utils";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { SwapBeforeBridgeRepository } from "../../database/SwapBeforeBridgeRepository";
import { CallsFailedRepository } from "../../database/CallsFailedRepository";
import { SwapMetadataRepository } from "../../database/SwapMetadataRepository";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";
import { IndexerQueuesService } from "../../messaging/service";
import { entities } from "@repo/indexer-database";
import { createTestRetryProviderFactory } from "../../tests/testProvider";
import { RetryProvider } from "@across-protocol/sdk/dist/cjs/providers/retryProvider";
import { IndexerDataHandler } from "../service/IndexerDataHandler";

export const stubContractUtils = (
  contractName: string,
  mockAddress: string,
  chainId?: number,
) => {
  const functionName = `get${contractName}Address`;
  const stub = sinon.stub(contractUtils as any, functionName);
  if (chainId) {
    stub.withArgs(chainId).returns(mockAddress);
  } else {
    stub.returns(mockAddress);
  }
};

/**
 * Request object for waitForEventToBeStoredOrFail.
 * @template T The type of the entity to be searched for.
 * @property {Repository<T>} repository - The repository to search in.
 * @property {FindOptionsWhere<T>} findOptions - The search criteria.
 * @property {number} [timeout=10000] - The timeout in milliseconds.
 * @property {number} [interval=100] - The interval in milliseconds.
 */
export type WaitForEventToBeStoredOrFailRequest<T extends ObjectLiteral> = {
  repository: Repository<T>;
  findOptions: FindOptionsWhere<T>;
  timeout?: number;
  interval?: number;
};

/**
 * Waits for a certain event to be stored in the database or fails after a given timeout.
 * @param request The request object containing the repository, search criteria, and timeout options.
 * @returns The found event entity.
 * @throws Error if the event is not found within the timeout.
 */
export async function waitForEventToBeStoredOrFail<T extends ObjectLiteral>(
  request: WaitForEventToBeStoredOrFailRequest<T>,
): Promise<T> {
  const { repository, findOptions, timeout = 10000, interval = 100 } = request;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await repository.findOne({ where: findOptions });
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Event not found within ${timeout}ms using options: ${JSON.stringify(
      findOptions,
    )}`,
  );
}

/**
 * Checks if an event is correctly indexed by the given indexer data handler.
 * It processes the block range, verifies the event exists in the repository,
 * compares it with the expected event using the comparison function,
 * and then deletes it to allow for subsequent tests (e.g. websocket indexing).
 * @param handlerFactory Factory function to create the indexer data handler.
 * @param blockNumber The block number to process.
 * @returns The found event entity.
 */
/**
 * Parameters for sanityCheckWithEventIndexer
 */
export type SanityCheckParams<T extends ObjectLiteral, H> = {
  handlerFactory: () => H;
  repository: Repository<T>;
  findOptions: FindOptionsWhere<T>;
  blockNumber: number;
};

/**
 * Checks if an event is correctly indexed by the given indexer data handler.
 * It processes the block range, verifies the event exists in the repository,
 * and then deletes it to allow for subsequent tests (e.g. websocket indexing).
 * @param params The sanity check parameters.
 * @returns The found event entity.
 */
export async function sanityCheckWithEventIndexer<
  T extends ObjectLiteral,
  H extends IndexerDataHandler,
>(params: SanityCheckParams<T, H>): Promise<T> {
  const { handlerFactory, repository, findOptions, blockNumber } = params;
  const handler = handlerFactory();

  await handler.processBlockRange(
    { from: blockNumber, to: blockNumber },
    blockNumber - 1,
  );

  const event = await repository.findOne({ where: findOptions });
  if (!event) {
    throw new Error(
      `Sanity check failed: Event not found for options: ${JSON.stringify(findOptions)}`,
    );
  }

  // delete the entry
  await repository.delete(findOptions);

  return event;
}

/**
 * Request object for getSpokePoolIndexerDataHandler.
 * @property {DataSource} dataSource - The database data source.
 * @property {Logger} logger - The logger instance.
 * @property {number} chainId - The chain ID for the spoke pool.
 * @property {number} hubPoolChainId - The chain ID for the hub pool.
 */
export type GetSpokePoolIndexerDataHandlerRequest = {
  dataSource: DataSource;
  logger: Logger;
  chainId: number;
  hubPoolChainId: number;
};

/**
 * Creates a SpokePoolIndexerDataHandler for testing purposes.
 * @param request The configuration for the handler.
 * @returns A configured SpokePoolIndexerDataHandler.
 */
export const getSpokePoolIndexerDataHandler = (
  request: GetSpokePoolIndexerDataHandlerRequest,
) => {
  const { dataSource, logger, chainId, hubPoolChainId } = request;
  const retryProvidersFactory = createTestRetryProviderFactory(logger);
  retryProvidersFactory.initializeProviders();
  const provider = retryProvidersFactory.getProviderForChainId(
    chainId,
  ) as RetryProvider;

  // Create Factories
  const configStoreClientFactory = new ConfigStoreClientFactory(
    retryProvidersFactory,
    logger,
    undefined,
  );
  const hubPoolClientFactory = new HubPoolClientFactory(
    retryProvidersFactory,
    logger,
    { configStoreClientFactory },
  );
  const spokePoolClientFactory = new SpokePoolClientFactory(
    retryProvidersFactory,
    logger,
    { hubPoolClientFactory },
  );

  // Create Repositories
  const spokePoolRepo = new SpokePoolRepository(dataSource, logger);
  const swapBeforeBridgeRepo = new SwapBeforeBridgeRepository(
    dataSource,
    logger,
  );
  const callsFailedRepo = new CallsFailedRepository(dataSource, logger);
  const swapMetadataRepo = new SwapMetadataRepository(dataSource, logger);

  // Create Services
  // Stub SpokePoolProcessor to avoid pg_advisory_xact_lock issues with pg-mem
  const spokePoolProcessor = {
    process: sinon.stub().resolves(),
  } as unknown as SpokePoolProcessor;

  const indexerQueuesService = {
    publish: sinon.stub().resolves(),
    publishMessagesBulk: sinon.stub().resolves(),
  } as unknown as IndexerQueuesService;

  const handler = new SpokePoolIndexerDataHandler(
    logger,
    chainId,
    hubPoolChainId,
    provider,
    configStoreClientFactory,
    hubPoolClientFactory,
    spokePoolClientFactory,
    spokePoolRepo,
    swapBeforeBridgeRepo,
    callsFailedRepo,
    swapMetadataRepo,
    spokePoolProcessor,
    indexerQueuesService,
  );

  // Stub the methods that publish to queues to avoid issues in tests
  sinon.stub(handler as any, "publishNewRelays").resolves();
  sinon.stub(handler as any, "publishSwaps").resolves();

  return handler;
};

// Event Fields Constants
const V3_FUNDS_DEPOSITED_FIELDS = [
  "blockNumber",
  "transactionHash",
  "transactionIndex",
  "logIndex",
  "finalised",
  "destinationChainId",
  "depositId",
  "depositor",
  "inputToken",
  "outputToken",
  "inputAmount",
  "outputAmount",
  "quoteTimestamp",
  "fillDeadline",
  "exclusivityDeadline",
  "recipient",
  "exclusiveRelayer",
  "message",
];

const FILLED_V3_RELAY_FIELDS = [
  "blockNumber",
  "transactionHash",
  "transactionIndex",
  "logIndex",
  "finalised",
  "depositId",
  "originChainId",
  "destinationChainId",
  "inputToken",
  "outputToken",
  "inputAmount",
  "outputAmount",
  "fillDeadline",
  "exclusivityDeadline",
  "exclusiveRelayer",
  "depositor",
  "recipient",
  "message",
  "relayer",
  "repaymentChainId",
  "updatedRecipient",
  "updatedMessage",
  "updatedOutputAmount",
  "fillType",
];

const EXECUTED_RELAYER_REFUND_ROOT_FIELDS = [
  "blockNumber",
  "transactionHash",
  "transactionIndex",
  "logIndex",
  "finalised",
  "rootBundleId",
  "leafId",
  "l2TokenAddress",
  "amountToReturn",
  "refundAmounts",
  "refundAddresses",
  "deferredRefunds",
  "caller",
];

const RELAYED_ROOT_BUNDLE_FIELDS = [
  "chainId",
  "blockNumber",
  "transactionHash",
  "transactionIndex",
  "logIndex",
  "finalised",
  "rootBundleId",
  "relayerRefundRoot",
  "slowRelayRoot",
];

const compareSubset = <T>(
  saved: Partial<T>,
  expected: Partial<T>,
  fields: string[],
) => {
  const savedSubset: Record<string, any> = {};
  const expectedSubset: Record<string, any> = {};
  fields.forEach((f) => {
    savedSubset[f] = (saved as any)[f];
    expectedSubset[f] = (expected as any)[f];
  });
  expect(savedSubset).to.deep.equal(expectedSubset);
};

export const compareFundsDepositedEvents = (
  saved: Partial<entities.V3FundsDeposited>,
  expected: Partial<entities.V3FundsDeposited>,
) => {
  compareSubset(saved, expected, V3_FUNDS_DEPOSITED_FIELDS);
};

export const compareFilledRelayEvents = (
  saved: Partial<entities.FilledV3Relay>,
  expected: Partial<entities.FilledV3Relay>,
) => {
  compareSubset(saved, expected, FILLED_V3_RELAY_FIELDS);
};

export const compareExecutedRelayerRefundRootEvents = (
  saved: Partial<entities.ExecutedRelayerRefundRoot>,
  expected: Partial<entities.ExecutedRelayerRefundRoot>,
) => {
  compareSubset(saved, expected, EXECUTED_RELAYER_REFUND_ROOT_FIELDS);
};

export const compareRelayedRootBundleEvents = (
  saved: Partial<entities.RelayedRootBundle>,
  expected: Partial<entities.RelayedRootBundle>,
) => {
  compareSubset(saved, expected, RELAYED_ROOT_BUNDLE_FIELDS);
};
