import express from "express";
import { EventProcessorManager } from "./eventProcessorManager";
import * as ss from "superstruct";
import bearerToken from "express-bearer-token";
import { v4 as uuidv4 } from "uuid";

type Dependencies = {
  eventProcessorManager: EventProcessorManager;
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

export function WebhookRouter(deps: Dependencies): express.Router {
  const router = express.Router();

  router.use(express.json());
  router.use(bearerToken());

  router.get("/webhook", (req: express.Request, res: express.Response) => {
    res.status(200).send("Webhooks running");
  });
  router.post(
    "/webhook",
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      try {
        const token = req.token;
        if (!token) {
          throw new Error("API Key required");
        }
        const parsedBody = RegistrationParams.create(req.body);
        const id = uuidv4();
        deps.eventProcessorManager
          .registerWebhook(id, parsedBody, token)
          .then((id) => res.status(201).send(id))
          .catch((error) => next(error));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/webhook/:id",
    (
      req: express.Request & { token?: string },
      res: express.Response,
      next: express.NextFunction,
    ) => {
      try {
        const parsedBody = UnregisterParams.create(req.body);
        deps.eventProcessorManager
          .unregisterWebhook(parsedBody, req.token)
          .then(() => res.status(204).send())
          .catch((error) => next(error));
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
