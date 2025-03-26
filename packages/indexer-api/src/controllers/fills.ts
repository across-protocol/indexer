import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { FillsService } from "../services/fills";
import { UnmatchedFillsParams } from "../dtos/fills.dto";

export class FillsController {
  constructor(private service: FillsService) {}

  public getUnmatchedFills = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const params = s.create(req.query, UnmatchedFillsParams);
      const result = await this.service.getUnmatchedFills(params);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
