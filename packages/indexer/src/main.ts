import { object, string, assert } from "superstruct";

const databaseConfigStruct = object({
  host: string(),
  port: string(),
  user: string(),
  password: string(),
  dbName: string(),
});

export async function Main(env: Record<string, string | undefined>) {
  // Validate database config
  const databaseConfig = {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    dbName: env.DATABASE_NAME,
  };
  assert(databaseConfig, databaseConfigStruct);

  return true;
}
