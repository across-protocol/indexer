import { V3FundsDeposited } from "../entities";
import { getRandomInt } from "../utils/FixtureUtils";
import { DataSource, Repository } from "typeorm";

export class FundsDepositedFixture {
  private repository: Repository<V3FundsDeposited>;
  public constructor(private dataSource: DataSource) {
    this.setRepository();
  }

  private setRepository() {
    this.repository = this.dataSource.getRepository(V3FundsDeposited);
  }

  public mockFundsDeposited(overrides: Partial<V3FundsDeposited>) {
    return {
      relayHash: "0xaaa",
      depositId: getRandomInt().toString(),
      originChainId: 1,
      destinationChainId: 10,
      fromLiteChain: false,
      toLiteChain: false,
      depositor: "0x",
      recipient: "0x",
      inputToken: "0x",
      inputAmount: "10",
      outputToken: "0x",
      outputAmount: "9",
      message: "0x",
      messageHash: "0x",
      internalHash: "0xaaa",
      exclusiveRelayer: "0x",
      exclusivityDeadline: new Date(),
      fillDeadline: new Date(),
      quoteTimestamp: new Date(),
      transactionHash: "0x",
      transactionIndex: 1,
      logIndex: 1,
      blockNumber: 1,
      finalised: true,
      blockTimestamp: new Date(),
      ...overrides,
    };
  }

  public insertDeposits(deposits: Partial<V3FundsDeposited>[]) {
    return this.repository.insert(deposits);
  }

  public deleteAllDeposits() {
    return this.repository.query(
      `truncate table "evm"."v3_funds_deposited" restart identity cascade`,
    );
  }
}
