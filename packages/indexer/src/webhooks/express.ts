import assert from "assert";
import express from "express";
import { Webhooks } from "./webhooks";
import * as ss from "superstruct";
import bearerToken from "express-bearer-token";

type Config = {
  port?: number;
};

type Dependencies = {
  webhooks: Webhooks;
};

const RegistrationParams = ss.object({
  type: ss.string(),
  url: ss.string(),
  filter: ss.record(ss.string(), ss.any()),
});
const UnregisterParams = ss.object({
  type: ss.string(),
  id: ss.string(),
});

export function ExpressApp(
  config: Config,
  deps: Dependencies,
): express.Application {
  const app = express();
  const port = config.port ?? 3000;

  app.use(express.json());
  app.use(bearerToken());

  app.post(
    "/webhook",
    async (
      req: express.Request & { token?: string },
      res: express.Response,
    ) => {
      try {
        const parsedBody = RegistrationParams.create(req.body);
        const id = await deps.webhooks.registerWebhook(parsedBody, req.token);
        res.status(201).send(id);
      } catch (error) {
        res.status(400).send((error as Error).message);
      }
    },
  );

  app.delete(
    "/webhook/:id",
    async (
      req: express.Request & { token?: string },
      res: express.Response,
    ) => {
      try {
        const parsedBody = UnregisterParams.create(req.body);
        await deps.webhooks.unregisterWebhook(parsedBody, req.token);
        res.status(204).send();
      } catch (error) {
        res.status(400).send((error as Error).message);
      }
    },
  );

  app.get("/", (req, res) => {
    res.send("Webhook server running");
  });

  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      res.status(500).send("Something went wrong!");
    },
  );

  return app;
}
