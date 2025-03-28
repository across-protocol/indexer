import { Router } from "express";
import { DataSource } from "@repo/indexer-database";
import { FillsController } from "../controllers/fills";
import { FillsService } from "../services/fills";

export function getRouter(db: DataSource): Router {
  const router = Router();
  const service = new FillsService(db);
  const controller = new FillsController(service);
  router.get("/fills/unmatched", controller.getUnmatchedFills);
  return router;
}
