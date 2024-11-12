import { NextFunction, Router, Request, Response } from "express";
import { DataSource } from "@repo/indexer-database";
import { StatsPageService } from "../services";
import { StatsPageController } from "../controllers";

export function getRouter(db: DataSource): Router {
  const router = Router();
  const statsPageService = new StatsPageService(db);
  const statsPageController = new StatsPageController(statsPageService);
  router.get("/pages/stats", statsPageController.getStatsPage as any);
  return router;
}
