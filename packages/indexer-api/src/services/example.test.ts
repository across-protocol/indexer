import { expect } from "chai";
import request from "supertest";

import { ExpressApp } from "../express-app";
import * as example from "./example";

describe("example api", () => {
  it("should return now", async () => {
    const api = example.ExampleApi();
    const result = await api.now?.();
    expect(result).to.be.above(0);
  });
  it("should echo", async () => {
    const api = example.ExampleApi();
    const result = await api.echo?.("hello");
    expect(result).to.equal("hello");
  });
});

describe("example router", () => {
  it("should return now", async () => {
    const router = example.getRouter();
    const app = ExpressApp({ example: router });
    const res = await request(app).get(`/example/now`);
    expect(res.status).to.equal(200);
    expect(res.body).to.be.above(0);
  });
  it("should echo", async () => {
    const router = example.getRouter();
    const app = ExpressApp({ example: router });
    const params = { message: "hello" };
    const queryString = new URLSearchParams(params).toString();
    const res = await request(app).get(`/example/echo?${queryString}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal(params);
  });
});
