import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getConfig } from "../config.ts";
import * as schema from "./schema.ts";

/**
 * One shared connection pool for the whole process.
 * Neon needs SSL; its connection strings already include `sslmode=require`.
 */
export const pool = new pg.Pool({
  connectionString: getConfig().DATABASE_URL,
  max: 5,
});

export const db = drizzle({ client: pool, schema });

/** Closes all connections so command-line scripts can exit. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
