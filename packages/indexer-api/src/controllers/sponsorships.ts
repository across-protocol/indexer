import { Request, Response, NextFunction } from "express";
import * as s from "superstruct";
import { SponsorshipsService } from "../services/sponsorships";
import { GetSponsorshipsDto } from "../dtos/sponsorships.dto";

/**
 * Controller for handling sponsorship-related API requests.
 */
export class SponsorshipsController {
  /**
   * @param {SponsorshipsService} service The service for handling sponsorship business logic.
   */
  constructor(private service: SponsorshipsService) {}

  /**
   * Handles the request to get sponsorship data.
   * It validates the query parameters, calls the service to fetch the data,
   * and sends the response.
   *
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @param {NextFunction} next The Express next middleware function.
   */
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
