import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { DepositsService } from "../services/deposits";
import { DepositsParams, DepositParams } from "../dtos/deposits.dto";

export class DepositsController {
  constructor(private service: DepositsService) {}

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
}
