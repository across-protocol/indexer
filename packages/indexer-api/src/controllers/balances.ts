import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { BalancesService } from "../services/balances";
import {
  HubPoolBalanceQueryParams,
  SpokePoolBalanceParams,
} from "../dtos/balances.dto";

export class BalancesController {
  constructor(private service: BalancesService) {}

  public getHubPoolBalance = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    req.query && s.assert(req.query, HubPoolBalanceQueryParams);
    this.service
      .hubPoolBalance(req.query)
      .then((result) => res.json(result))
      .catch((err) => next(err));
  };

  public getSpokePoolBalance = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    req.query && s.assert(req.query, SpokePoolBalanceParams);
    res.json([]);
  };
}
