import cors from "cors";
import bodyParser from "body-parser";
import type { Request, Response, NextFunction, Express, Router } from "express";
import express from "express";
import errorHandler from "./error-handler";

export class HttpError extends Error {
  status?: number;
}
export function isHttpError(error: any): error is HttpError {
  return error.status !== undefined;
}

type RouterConfigs = Record<string, Router>;

export function ExpressApp(routers: RouterConfigs): Express {
  const app = express();

  // enable if behind proxy like cloudflare/ginx
  app.set("trust proxy", true);
  app.set("views", `${__dirname}/views`);
  app.set("view engine", "ejs");

  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.options("*", cors());

  [...Object.values(routers)].forEach((router) => {
    app.use("/", router);
  });

  app.use(function (_: Request, __: Response, next: NextFunction) {
    const error = new HttpError("Route does not exist.");
    error["status"] = 404;
    next(error);
  });

  // Register an error handler as the last part of the
  // express pipeline
  app.use(errorHandler);

  return app;
}
