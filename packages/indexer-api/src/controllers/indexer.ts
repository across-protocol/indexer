import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { DataSource } from "@repo/indexer-database";
import { IndexerService } from "../services/indexer";

const DepositsParams = s.object({
  depositor: s.optional(s.string()),
  recipient: s.optional(s.string()),
  inputToken: s.optional(s.string()),
  outputToken: s.optional(s.string()),
  integrator: s.optional(s.string()),
  status: s.optional(s.string()),
  // some kind of pagination options, skip could be the start point
  skip: s.optional(
    s.coerce(s.number(), s.string(), (value) => parseInt(value)),
  ),
  // pagination limit, how many to return after the start, note we convert string to number
  limit: s.optional(
    s.coerce(s.number(), s.string(), (value) => parseInt(value)),
  ),
});
// this coerces any string numbers into numbers that we defined in our params

export type DepositsParams = s.Infer<typeof DepositsParams>;

const DepositParams = s.object({
  depositId: s.optional(
    s.coerce(s.number(), s.string(), (value) => parseInt(value)),
  ),
  originChainId: s.optional(
    s.coerce(s.number(), s.string(), (value) => parseInt(value)),
  ),
  depositTxHash: s.optional(s.string()),
  relayDataHash: s.optional(s.string()),
  index: s.defaulted(
    s.coerce(s.number(), s.string(), (value) => parseInt(value)),
    0,
  ),
});

export type DepositParams = s.Infer<typeof DepositParams>;

// query hub pools by chainId? default to 1 if not specified. will leave option in case of testnets?
const HubPoolBalanceParams = s.object({
  chainId: s.defaulted(s.number(), 1),
  l1Token: s.string(),
});

// query spokepools by chainId, must specify
const SpokePoolBalanceParams = s.object({
  chainId: s.number(),
  // unsure why we have timestamp, implies we are storign history of balances? this is in the spec.
  timestamp: s.number(),
  // unsure why specified as l2Token in spec, don't we have spoke pool on L1?
  l2Token: s.optional(s.number()),
});

export class IndexerController {
  public service: IndexerService;
  constructor(private db: DataSource) {
    this.service = new IndexerService(this.db);
  }

  public getDeposits = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const params = s.create(req.query, DepositsParams);
      const result = await this.service.getDeposits(params);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public getDepositStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const params = s.create(req.query, DepositParams);
      const result = await this.service.getDepositStatus(params);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public getHubPoolBalance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    s.assert(req.query, HubPoolBalanceParams);
    return 0;
  };

  public getSpokePoolBalance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    s.assert(req.query, SpokePoolBalanceParams);

    return 0;
  };
}
