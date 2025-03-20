import Redis from "ioredis";
import { Router } from "express";
import { DataSource } from "@repo/indexer-database";
import { DepositsController } from "../controllers/deposits";
import { DepositsService } from "../services/deposits";

export function getRouter(db: DataSource, redis: Redis): Router {
  const router = Router();
  const service = new DepositsService(db, redis);
  const controller = new DepositsController(service);
  router.get("/deposits", controller.getDeposits);
  router.get("/deposit/status", controller.getDepositStatus);
  router.get("/deposit/unfilled", controller.getUnfilledDeposits);
  return router;
}
