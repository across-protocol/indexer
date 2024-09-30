import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { DepositsService } from "../services/deposits";
import {
  HubPoolBalanceParams,
  SpokePoolBalanceParams,
} from "../dtos/balances.dto";

export class BalancesController {
  constructor(private service: DepositsService) {}

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
