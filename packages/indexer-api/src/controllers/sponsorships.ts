import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { SponsorshipsService } from "../services/sponsorships";
import { GetSponsorshipsDto } from "../dtos/sponsorships.dto";

export class SponsorshipsController {
  constructor(private service: SponsorshipsService) {}

  public getSponsorships = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const params = s.create(req.query, GetSponsorshipsDto);
      const result = await this.service.getSponsorships(params);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
