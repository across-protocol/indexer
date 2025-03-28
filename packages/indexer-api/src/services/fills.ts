import { DataSource, entities } from "@repo/indexer-database";
import type { UnmatchedFillsParams } from "../dtos/fills.dto";

export class FillsService {
  constructor(private db: DataSource) {}

  public async getUnmatchedFills(
    params: UnmatchedFillsParams,
  ): Promise<
    Array<entities.FilledV3Relay & { status: entities.RelayHashInfo["status"] }>
  > {
    const {
      originChainId,
      destinationChainId,
      startTimestamp = 0,
      endTimestamp = Date.now(),
      relayer,
      skip,
      limit,
    } = params;

    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    const relayHashInfoRepo = this.db.getRepository(entities.RelayHashInfo);
    const queryBuilder = relayHashInfoRepo
      .createQueryBuilder("rhi")
      .leftJoinAndSelect(
        entities.FilledV3Relay,
        "fill",
        "fill.id = rhi.fillEventId",
      )
      .where("rhi.fillEventId IS NOT NULL")
      .andWhere("rhi.depositEventId IS NULL")
      .andWhere("fill.blockTimestamp BETWEEN :startDate AND :endDate", {
        startDate,
        endDate,
      })
      .select(["fill.*", `rhi.status as status`]);

    if (originChainId) {
      queryBuilder.andWhere("fill.originChainId = :originChainId", {
        originChainId,
      });
    }

    if (destinationChainId) {
      queryBuilder.andWhere("fill.destinationChainId = :destinationChainId", {
        destinationChainId,
      });
    }

    if (relayer) {
      queryBuilder.andWhere("fill.relayer = :relayer", { relayer });
    }

    queryBuilder.offset(skip);
    queryBuilder.limit(limit);

    return queryBuilder.execute();
  }
}
