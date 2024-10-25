import { Router } from "express";
import Redis from "ioredis";
import { BalancesController } from "../controllers/balances";
import { BalancesService } from "../services/balances";

export function getRouter(redis: Redis): Router {
  const router = Router();
  const service = new BalancesService(redis);
  const controller = new BalancesController(service);
  router.get("/hubpool-balance", controller.getHubPoolBalance);
  router.get("/spokepool-balance", controller.getSpokePoolBalance);
  return router;
}
