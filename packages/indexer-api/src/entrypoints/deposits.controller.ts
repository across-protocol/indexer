import { NextFunction, Router } from "express";
import * as s from "superstruct";

import { DepositsService } from "../services/indexer";
import { DataSource } from "@repo/indexer-database";

const DepositParams = s.object({
  id: s.string(),
  originChainId: s.number(),
});

export class DepositsController {
  public router: Router;
  public service: DepositsService;
  constructor(private db: DataSource) {
    this.router = Router();
    this.service = new DepositsService(this.db);
    this.setRoutes();
  }
  private setRoutes(): void {
    this.router.get("/deposits", this.service.getDeposits);
    // this.router.get('/deposit/status', this.service.paginationByUsername);
  }
}
