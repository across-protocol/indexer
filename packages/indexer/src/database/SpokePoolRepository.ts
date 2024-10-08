import winston from "winston";
import * as across from "@across-protocol/sdk";
import { getRelayHashFromEvent } from "@across-protocol/sdk/dist/cjs/utils/SpokeUtils";
import { DataSource, entities, utils } from "@repo/indexer-database";

export class SpokePoolRepository extends utils.BaseRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 2000,
  ) {
    super(postgres, logger, true);
  }

  private formatRelayData(
    event:
      | across.interfaces.DepositWithBlock
      | across.interfaces.FillWithBlock
      | across.interfaces.SlowFillRequestWithBlock,
  ) {
    return {
      inputAmount: event.inputAmount.toString(),
      outputAmount: event.outputAmount.toString(),
      fillDeadline: new Date(event.fillDeadline * 1000),
      exclusivityDeadline:
        event.exclusivityDeadline === 0
          ? undefined
          : new Date(event.exclusivityDeadline * 1000),
    };
  }

  public async formatAndSaveV3FundsDepositedEvents(
    v3FundsDepositedEvents: (across.interfaces.DepositWithBlock & {
      integratorId: string | undefined;
    })[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = v3FundsDepositedEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        quoteTimestamp: new Date(event.quoteTimestamp * 1000),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.V3FundsDeposited,
          eventsChunk,
          ["depositId", "originChainId"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveFilledV3RelayEvents(
    filledV3RelayEvents: across.interfaces.FillWithBlock[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = filledV3RelayEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        relayExecutionInfo: {
          ...event.relayExecutionInfo,
          updatedOutputAmount:
            event.relayExecutionInfo.updatedOutputAmount.toString(),
        },
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.FilledV3Relay,
          eventsChunk,
          ["relayHash"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedV3SlowFillEvents(
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = requestedV3SlowFillEvents.map((event) => {
      return {
        ...event,
        relayHash: getRelayHashFromEvent(event),
        ...this.formatRelayData(event),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.RequestedV3SlowFill,
          eventsChunk,
          ["depositId", "originChainId"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRequestedSpeedUpV3Events(
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: number]: across.interfaces.SpeedUpWithBlock[];
      };
    },
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = Object.values(requestedSpeedUpV3Events).flatMap(
      (eventsByDepositId) =>
        Object.values(eventsByDepositId).flatMap((events) =>
          events.map((event) => {
            return {
              ...event,
              updatedOutputAmount: event.updatedOutputAmount.toString(),
              finalised: event.blockNumber <= lastFinalisedBlock,
            };
          }),
        ),
    );
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.RequestedSpeedUpV3Deposit,
          eventsChunk,
          ["depositId", "originChainId", "transactionHash"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveRelayedRootBundleEvents(
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[],
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = relayedRootBundleEvents.map((event) => {
      return {
        ...event,
        chainId,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.RelayedRootBundle,
          eventsChunk,
          ["chainId", "rootBundleId"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveExecutedRelayerRefundRootEvents(
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = executedRelayerRefundRootEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
        refundAmounts: event.refundAmounts.map((amount) => amount.toString()),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.ExecutedRelayerRefundRoot,
          eventsChunk,
          ["chainId", "rootBundleId", "leafId"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async formatAndSaveTokensBridgedEvents(
    tokensBridgedEvents: across.interfaces.TokensBridged[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = tokensBridgedEvents.map((event) => {
      return {
        ...event,
        amountToReturn: event.amountToReturn.toString(),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.insertWithFinalisationCheck(
          entities.TokensBridged,
          eventsChunk,
          ["chainId", "leafId", "l2TokenAddress", "transactionHash"],
          lastFinalisedBlock,
        ),
      ),
    );
    return savedEvents.flat();
  }
}
