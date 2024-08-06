import assert from "assert";
import { Request, Response, NextFunction, Router } from "express";
import { JSON } from "../types";

// example api functions, which take in parameters passed in from a restful call and return something
// which can be serialized to json
type APIHandler = (params?: JSON) => Promise<JSON> | JSON;
export function ExampleApi(): Record<string, APIHandler> {
  // Two simple calls, one to echo params, another to return current server time.
  return {
    echo: async (params: JSON): Promise<JSON> => params,
    now: (): number => Date.now(),
  };
}

// build up express style calls to our example api
export function getRouter(): Router {
  const router = Router();
  const api = ExampleApi();
  // example call: curl localhost:8080/example/now -> timestamp
  router.get(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const params = req.query;
      const action = req.params.action;
      try {
        assert(action, "No api call specified");
        // extract method from api calls
        const method = api[action];
        //check if it exists
        if (method) {
          // call and return result
          const result = await method(params);
          return res.json(result);
        }
        throw new Error(`Unknown api call: ${action}`);
      } catch (err) {
        next(err);
      }
    },
  );
  // return the router to be included in the greater express app
  return router;
}
