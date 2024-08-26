import dotenv from "dotenv";
import assert from "assert";

import * as Template from "@repo/template";
import * as Indexer from "@repo/indexer";
import * as PersistenceExample from "@repo/persistence-example";
import * as IndexerApi from "@repo/indexer-api";

import { createLogger, format, transports } from "winston";

// Create the logger instance
const logger = createLogger({
  level: "info", // Set the default log level
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length
        ? JSON.stringify(meta, null, 2)
        : "";
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaString}`;
    }),
  ),

  transports: [
    new transports.Console(), // Log to the console
  ],
});

dotenv.config();

async function run() {
  const { APP } = process.env;
  assert(APP, 'Specify the application to start with "APP=appname pnpm start"');
  switch (APP) {
    case "template":
      void (await Template.Main(process.env));
      return "Example template app running";
    case "indexer":
      void (await Indexer.Main(process.env, logger));
      break;
    case "persistence-example":
      void (await PersistenceExample.Main(process.env));
      return "Example persistence app running";
    case "indexer-api":
      void (await IndexerApi.Main(process.env, logger));
      return "Indexer API running";
    default:
      throw new Error(`Unable to start, unknown app: ${APP}`);
  }
}

run()
  .then((x) => x && logger.info(x))
  .catch(console.log);
