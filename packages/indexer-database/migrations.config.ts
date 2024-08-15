import dotenv from "dotenv"
import { DataSource } from "typeorm"

dotenv.config();

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || "5432", 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    logging: "all",
    entities: ["src/entities/*.ts"],
    migrationsTableName: "_migrations",
    migrations: ["src/migrations/*.ts"],
});

