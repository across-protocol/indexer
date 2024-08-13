import { expect } from "chai";

import * as main from "./main";

describe("main", () => {
  it("should return true", async () => {
    const result = await main.Main({
      DATABASE_HOST: "host",
      DATABASE_PORT: "5432",
      DATABASE_USER: "user",
      DATABASE_PASSWORD: "password",
      DATABASE_NAME: "database",
    });
    expect(result).to.be.true;
  });
});
