import { DataSource, entities } from "@repo/indexer-database";

export class StatsPageService {
  constructor(private db: DataSource) {}

  public async getStatsPageData() {
    const bundles = await this.db.getRepository(entities.Bundle).find({
      relations: { proposal: true },
      order: { proposal: { blockNumber: "DESC" } },
      take: 6,
    });
    return { bundles };
  }
}
