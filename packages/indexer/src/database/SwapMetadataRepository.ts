import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import { SwapMetadataEvent } from "../web3/model/events";
import { ethers } from "ethers";

export class SwapMetadataRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async formatAndSaveSwapMetadataEvents(
    swapMetadataEvents: SwapMetadataEvent[],
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = swapMetadataEvents.map((event) => {
      const entity = new entities.SwapMetadata();

      // Decode the bytes data using the same ABI encoding as the source
      const decodedData = this.decodeSwapMetadata(event.args.data);

      entity.version = decodedData.version.toString();
      entity.type = decodedData.type as entities.SwapType;
      entity.side = decodedData.side as entities.SwapSide;
      entity.address = decodedData.address;
      entity.maximumAmountIn = decodedData.maximumAmountIn.toString();
      entity.minAmountOut = decodedData.minAmountOut.toString();
      entity.expectedAmountOut = decodedData.expectedAmountOut.toString();
      entity.expectedAmountIn = decodedData.expectedAmountIn.toString();
      entity.swapProvider = decodedData.swapProvider;
      entity.slippage = decodedData.slippage.toString();
      entity.autoSlippage = decodedData.autoSlippage;
      entity.recipient = decodedData.recipient;
      entity.appFeeRecipient = decodedData.appFeeRecipient || null;

      // Standard blockchain event fields
      entity.blockHash = event.blockHash;
      entity.blockNumber = event.blockNumber;
      entity.transactionHash = event.transactionHash;
      entity.logIndex = event.logIndex;
      entity.chainId = chainId;
      entity.finalised = event.blockNumber <= lastFinalisedBlock;

      return entity;
    });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SwapMetadata>(
          entities.SwapMetadata,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async deleteUnfinalisedSwapMetadataEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const deletedSwapMetadataEvents = await this.deleteUnfinalisedEvents(
      chainId,
      chainIdColumn,
      lastFinalisedBlock,
      entities.SwapMetadata,
    );
    return deletedSwapMetadataEvents;
  }

  /**
   * Decodes the bytes data from the MetadataEmitted event
   * The data is encoded using the same ABI encoding as the source:
   * ["uint8", "uint8", "uint8", "address", "uint256", "uint256", "uint256", "uint256", "string", "uint256", "bool", "address", "address"]
   */
  private decodeSwapMetadata(data: string) {
    const abiCoder = ethers.utils.defaultAbiCoder;

    try {
      const decoded = abiCoder.decode(
        [
          "uint8", // version
          "uint8", // type
          "uint8", // side
          "address", // address
          "uint256", // maximumAmountIn
          "uint256", // minAmountOut
          "uint256", // expectedAmountOut
          "uint256", // expectedAmountIn
          "string", // swapProvider
          "uint256", // slippage (in basis points)
          "bool", // autoSlippage
          "address", // recipient
          "address", // appFeeRecipient
        ],
        data,
      );

      return {
        version: decoded[0],
        type: decoded[1],
        side: decoded[2],
        address: decoded[3],
        maximumAmountIn: decoded[4],
        minAmountOut: decoded[5],
        expectedAmountOut: decoded[6],
        expectedAmountIn: decoded[7],
        swapProvider: decoded[8],
        slippage: decoded[9], // This is in basis points, so 100 = 1%
        autoSlippage: decoded[10],
        recipient: decoded[11],
        appFeeRecipient:
          decoded[12] === ethers.constants.AddressZero ? null : decoded[12],
      };
    } catch (error) {
      this.logger.error({
        at: "SwapMetadataRepository#decodeSwapMetadata",
        message: "Failed to decode swap metadata",
        error: error instanceof Error ? error.message : String(error),
        data,
      });
      throw error;
    }
  }
}
