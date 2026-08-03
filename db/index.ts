import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (db) return db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Add a Postgres database and set DATABASE_URL in your environment variables."
    );
  }

  const client = postgres(databaseUrl);
  db = drizzle(client, { schema });
  return db;
}
