import cors from "cors";
import bodyParser from "body-parser";
import type { Request, Response, NextFunction, Express, Router } from "express";
import express from "express";

export class ExtendedError extends Error {
  status?: number;
}
export function isExtendedError(error: any): error is ExtendedError {
  return error.status !== undefined;
}

type RouterConfigs = Record<string, Router>;

export function ExpressApp(routers: RouterConfigs): Express {
  const app = express();

  // enable if behind proxy like cloudflare/ginx
  app.set("trust proxy", true);

  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.options("*", cors());

  [...Object.entries(routers)].forEach(([key, router]) => {
    app.use(`/${key}`, router);
  });

  // return callable routers
  app.get("/", (req: Request, res: Response) => {
    res.json([...Object.keys(routers)]);
  });

  app.use(function (_: Request, __: Response, next: NextFunction) {
    const error = new ExtendedError("Not Found");
    error["status"] = 404;
    next(error);
  });

  app.use(function (
    err: ExtendedError | Error,
    req: Request,
    res: Response,
    // this needs to be included even if unused, since 4 param call triggers error handler
    _: NextFunction,
  ) {
    const request = {
      method: req.method,
      path: req.path,
      body: req.body,
    };
    let status = 500;
    if (isExtendedError(err)) {
      status = err.status ?? status;
    }
    res.status(status).json({
      message: err.message,
      request,
      stack: err.stack,
    });
  });

  return app;
}
