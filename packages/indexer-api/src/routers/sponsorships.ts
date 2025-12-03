import { Router } from "express";
import { DataSource } from "typeorm";
import { SponsorshipsController } from "../controllers/sponsorships";
import { SponsorshipsService } from "../services/sponsorships";

export function getRouter(db: DataSource): Router {
  const router = Router();
  const service = new SponsorshipsService(db);
  const controller = new SponsorshipsController(service);

  router.get("/sponsorships", controller.getSponsorships);

  return router;
}
