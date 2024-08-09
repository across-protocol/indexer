import assert from "assert";
import * as services from "./services";
import { providers } from "ethers";

export async function Main(env: Record<string, string | undefined>) {
  assert(env.INDEXER_PROVIDER_URL_1, "requires INDEXER_PROVIDER_URL_1");
  const provider1 = new providers.JsonRpcProvider(env.INDEXER_PROVIDER_URL_1);
  await services.deposits.Indexer({ provider: provider1 });
}
