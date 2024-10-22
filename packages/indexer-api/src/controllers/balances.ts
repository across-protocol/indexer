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
    { query }: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (!s.is(query, SpokePoolBalanceParams)) {
      return res.status(400).json({ error: "Invalid query" });
    }
    this.service
      .spokePoolBalance(query)
      .then((result) => res.json(result))
      .catch((err) => next(err));
  };
}
