import { NextFunction, Response } from "express";
import { StatsPageService } from "../services/stats-page";

export class StatsPageController {
  constructor(private statsPageService: StatsPageService) {}

  public getStatsPage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const data = await this.statsPageService.getStatsPageData();
      res.render(`${__dirname}/../views/pages/index`, data);
    } catch (error) {
      next(error);
    }
  };
}
