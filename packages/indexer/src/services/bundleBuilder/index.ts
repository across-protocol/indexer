import { BaseIndexer } from "../../generics";
import winston from "winston";
import { DataSource } from "@repo/indexer-database";
import {
  getBlockRangeBetweenBundles,
  getBlockRangeFromBundleToHead,
  ProviderLookup,
  resolveMostRecentProposedAndExecutedBundles,
} from "../../utils";
import { BundleRepository } from "../../database/BundleRepository";
import { utils } from "@across-protocol/sdk";

type BundleBuilderConfig = {
  providers: ProviderLookup;
  logger: winston.Logger;
  postgres: DataSource;
};

export class Processor extends BaseIndexer {
  private bundleRepository: BundleRepository;
  constructor(private config: BundleBuilderConfig) {
    super(config.logger, "bundleBuilder");
  }

  protected async indexerLogic(): Promise<void> {
    await Promise.allSettled([
      this.handleCurrentBundleLoop(),
      this.handleProposedBundleLoop(),
    ]);
  }

  protected initialize(): Promise<void> {
    if (!this.config.postgres) {
      this.logger.error({
        at: "BundleBuilder#Processor#initialize",
        message: "Postgres connection not provided",
      });
      throw new Error("Postgres connection not provided");
    }
    this.bundleRepository = new BundleRepository(
      this.config.postgres,
      this.config.logger,
      true,
    );
    return Promise.resolve();
  }

  private async handleCurrentBundleLoop(): Promise<void> {
    // Get the most recent proposed and executed bundles
    const { lastProposedBundle, lastExecutedBundle } =
      await resolveMostRecentProposedAndExecutedBundles(
        this.bundleRepository,
        this.logger,
      );
    const ranges = await getBlockRangeFromBundleToHead(
      (lastProposedBundle ?? lastExecutedBundle).proposal,
      this.config.providers,
    );
  }

  private async handleProposedBundleLoop(): Promise<void> {
    // Get the most recent proposed and executed bundles
    const { lastProposedBundle, lastExecutedBundle } =
      await resolveMostRecentProposedAndExecutedBundles(
        this.bundleRepository,
        this.logger,
      );
    // If no proposed bundle is found, skip the rest of the logic
    if (!utils.isDefined(lastProposedBundle)) {
      this.logger.debug({
        at: "BundleBuilder#Processor#handleProposedBundleLoop",
        message: "No proposed bundles found, skipping.",
      });
      return;
    }
    const ranges = getBlockRangeBetweenBundles(
      lastExecutedBundle.proposal,
      lastProposedBundle.proposal,
    );
  }
}
