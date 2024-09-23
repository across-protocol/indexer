import { Router } from "express";
import { DataSource } from "@repo/indexer-database";
import { IndexerController } from "../controllers/indexer";

export function getRouter(db: DataSource): Router {
  const router = Router();
  const controller = new IndexerController(db);
  router.get("/deposits", controller.getDeposits);
  router.get("/deposit/status", controller.getDepositStatus);
  return router;
}
