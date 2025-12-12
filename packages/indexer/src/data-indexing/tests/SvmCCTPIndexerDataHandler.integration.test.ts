import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import { entities } from "@repo/indexer-database";
import * as sinon from "sinon";
import * as across from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";
import { getTestDataSource } from "../../tests/setup";
import { SvmCCTPIndexerDataHandler } from "../service/SvmCCTPIndexerDataHandler";
import { CCTPRepository } from "../../database/CctpRepository";
import { BlockRange } from "../model";
import { createTestRetryProvider } from "../../tests/testProvider";
import { RetryProvider } from "@across-protocol/sdk/dist/cjs/providers/retryProvider";
import { formatFromAddressToChainFormat } from "../../utils";
import { getCctpDestinationChainFromDomain } from "../adapter/cctp-v2/service";

describe("SvmCCTPIndexerDataHandler Integration", () => {
  let dataSource: DataSource;
  let cctpRepository: CCTPRepository;
  let logger: Logger;
  let provider: across.arch.svm.SVMProvider;
  let handler: SvmCCTPIndexerDataHandler;

  beforeEach(async () => {
    dataSource = await getTestDataSource();
    cctpRepository = new CCTPRepository(dataSource, logger);
    provider = createTestRetryProvider(
      CHAIN_IDs.SOLANA,
      logger,
    ) as unknown as across.arch.svm.SVMProvider;

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    handler = new SvmCCTPIndexerDataHandler(
      logger,
      CHAIN_IDs.SOLANA,
      provider,
      cctpRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should fetch and store SponsoredDepositForBurn event", async () => {
    // Taken from: https://solscan.io/tx/32hTeHzomgViNyTnMsu9vrRFRmFHhJ4YH9BxZkLhFngxUHtKoj4R4buGsbDiz9Z5ce1WTzjNb3eBP7HiJbQKyqmG
    const transactionHash =
      "32hTeHzomgViNyTnMsu9vrRFRmFHhJ4YH9BxZkLhFngxUHtKoj4R4buGsbDiz9Z5ce1WTzjNb3eBP7HiJbQKyqmG";
    const blockNumber = 386165186;

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    const toAddress = (address: string, chainId: number) =>
      formatFromAddressToChainFormat(
        across.utils.toAddressType(address, chainId),
        chainId,
      );
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(0);

    await handler.processBlockRange(blockRange, blockNumber);

    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedDeposit = await depositRepo.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(savedDeposit).to.exist;
    expect(savedDeposit!.amount).to.equal(1000000);
    expect(savedDeposit!.burnToken).to.equal(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(savedDeposit!.destinationDomain).to.equal(19);
    // Get the destination chain ID from the DepositForBurn event
    const destinationChainId = getCctpDestinationChainFromDomain(
      savedDeposit!.destinationDomain,
    );

    expect(savedDeposit!.destinationCaller).to.equal(
      toAddress("111111111111PysXRvWRwzx4fP41srKS5j85QRc", destinationChainId),
    );

    const repo = dataSource.getRepository(entities.SponsoredDepositForBurn);
    const savedEvent = await repo.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);

    // Verify specific fields requested by user
    expect(savedEvent!.originSender).to.equal(
      "FmMK62wrtWVb5SVoTZftSCGw3nEDA79hDbZNTRnC1R6t",
    );
    expect(savedEvent!.finalRecipient).to.equal(
      toAddress("11111111111139tg9BccnAuutdgEanSRiyykvb1E", destinationChainId),
    );
    expect(savedEvent!.quoteDeadline.toString()).to.equal(
      new Date(1765531955 * 1000).toString(),
    );
    expect(savedEvent!.maxBpsToSponsor.toString()).to.equal("2002");
    expect(savedEvent!.maxUserSlippageBps.toString()).to.equal("500");
    expect(savedEvent!.finalToken).to.equal(
      toAddress("111111111111EnrHeSexKNBydTZAr233KX5AVrY", destinationChainId),
    );
  }).timeout(30000);
});
