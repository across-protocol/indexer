import assert from "assert";
import * as s from "superstruct";
import { Request, Response, NextFunction, Router } from "express";
import { JSON } from "../types";
import { DataSource, entities } from "@repo/indexer-database";

type APIHandler = (
  params?: JSON,
) => Promise<JSON> | JSON | never | Promise<never> | void | Promise<void>;
export function Indexer(db: DataSource): Record<string, APIHandler> {
  const DepositParams = s.object({
    id: s.string(),
  });
  // get a single deposit by an id, regardless of chain
  async function deposit(params: JSON) {
    s.assert(params, DepositParams);
    throw new Error(`Deposit id not found ${params.id}`);
  }
  // possible filter options
  const DepositsParams = s.object({
    depositor: s.optional(s.string()),
    recipient: s.optional(s.string()),
    inputToken: s.optional(s.string()),
    outputToken: s.optional(s.string()),
    integrator: s.optional(s.string()),
    status: s.optional(s.string()),
    // some kind of pagination options, skip could be the start point
    skip: s.optional(
      s.coerce(s.number(), s.string(), (value) => parseInt(value)),
    ),
    // pagination limit, how many to return after the start, note we convert string to number
    limit: s.optional(
      s.coerce(s.number(), s.string(), (value) => parseInt(value)),
    ),
  });
  // get a list of deposits filtered by options
  async function deposits(queryParams: JSON) {
    // this coerces any string numbers into numbers that we defined in our params
    const params = s.create(queryParams, DepositsParams);
    const repo = db.getRepository(entities.Deposit);
    const queryBuilder = repo.createQueryBuilder("deposit");

    if (params.depositor) {
      queryBuilder.andWhere("deposit.depositor = :depositor", {
        depositor: params.depositor,
      });
    }

    if (params.recipient) {
      queryBuilder.andWhere("deposit.recipient = :recipient", {
        recipient: params.recipient,
      });
    }

    if (params.inputToken) {
      queryBuilder.andWhere("deposit.inputToken = :inputToken", {
        inputToken: params.inputToken,
      });
    }

    if (params.outputToken) {
      queryBuilder.andWhere("deposit.outputToken = :outputToken", {
        outputToken: params.outputToken,
      });
    }

    if (params.integrator) {
      queryBuilder.andWhere("deposit.integrator = :integrator", {
        integrator: params.integrator,
      });
    }

    if (params.status) {
      queryBuilder.andWhere("deposit.status = :status", {
        status: params.status,
      });
    }

    if (params.skip) {
      queryBuilder.skip(params.skip);
    }

    if (params.limit) {
      // using take rather than limit
      queryBuilder.take(params.limit);
    }

    return (await queryBuilder.getMany()) as unknown as JSON;
  }
  // query hub pools by chainId? default to 1 if not specified. will leave option in case of testnets?
  const HubPoolBalanceParams = s.object({
    chainId: s.defaulted(s.number(), 1),
    l1Token: s.string(),
  });
  function hubPoolBalance(params: JSON) {
    s.assert(params, HubPoolBalanceParams);
    return 0;
  }
  // query spokepools by chainId, must specify
  const SpokePoolBalanceParams = s.object({
    chainId: s.number(),
    // unsure why we have timestamp, implies we are storign history of balances? this is in the spec.
    timestamp: s.number(),
    // unsure why specified as l2Token in spec, don't we have spoke pool on L1?
    l2Token: s.optional(s.number()),
  });
  function spokePoolBalance(params: JSON) {
    s.assert(params, SpokePoolBalanceParams);
    return 0;
  }

  const RelayerRefundParams = s.object({
    relayHash: s.string(),
  });
  function relayerRefund(params: JSON) {
    s.assert(params, RelayerRefundParams);
    throw new Error("Relayer refund not found");
  }

  const RelayerRefundsParams = s.object({
    relayer: s.string(),
    // some kind of pagination options, start could be start id or start index
    start: s.optional(s.string()),
    // pagination limit, how many to return after the start
    limit: s.optional(s.number()),
  });
  function relayerRefunds(params: JSON) {
    s.assert(params, RelayerRefundsParams);
    return [];
  }

  // TODO:
  function bundles() {
    return [];
  }

  return {
    // POC
    deposit,
    deposits,
    hubPoolBalance,
    spokePoolBalance,
    // Future endpoints
    relayerRefund,
    relayerRefunds,
    bundles,
  };
}

// build up express style calls to our example api
export function getRouter(db: DataSource): Router {
  const router = Router();
  const api = Indexer(db);
  // example call: curl localhost:8080/example/now -> timestamp
  router.get(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const params = req.query;
      const action = req.params.action;
      console.log(params, action);
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
