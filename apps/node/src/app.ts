import dotenv from "dotenv";
import assert from "assert";

import * as Template from "@repo/template";
import * as Indexer from "@repo/indexer";
import * as PersistenceExample from "@repo/persistence-example";

dotenv.config();

async function run() {
  const { APP } = process.env;
  assert(APP, 'Specify the application to start with "APP=appname pnpm start"');
  switch (APP) {
    case "template":
      void (await Template.Main(process.env));
      return "Example template app running";
    case "indexer":
      void (await Indexer.Main(process.env));
      return "Indexer running";
    case "persistence-example":
      void (await PersistenceExample.Main(process.env));
      return "Example template app running";
    default:
      throw new Error(`Unable to start, unknown app: ${APP}`);
  }
}

run().then(console.log).catch(console.error);
