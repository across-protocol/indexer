import { ExpressApp } from "./express-app";
import * as services from "./services";
export async function Main(env: Record<string, string | undefined>) {
  const { PORT = "8080" } = env;
  const port = Number(PORT);

  const exampleRouter = services.example.getRouter();
  const app = ExpressApp({ example: exampleRouter });

  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
  console.log(`Indexer api listening on port ${port}`);
}
