/**
 * Quick health check for the database:
 * is it reachable, is pgvector installed, and how many rows does each table have?
 *
 * Usage: npm run db:check
 */
import { sql } from "drizzle-orm";
import { closeDb, db } from "../db/client.ts";

async function main(): Promise<void> {
  const ext = await db.execute<{ extversion: string }>(
    sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  );
  const version = ext.rows[0]?.extversion;
  if (!version) {
    throw new Error("pgvector is not installed. Run `npm run db:migrate` first.");
  }
  console.log(`Connected. pgvector ${version} is installed.`);

  const counts = await db.execute<{ table: string; rows: number }>(sql`
    SELECT 'seasons' AS table, count(*)::int AS rows FROM seasons
    UNION ALL SELECT 'articles', count(*)::int FROM articles
    UNION ALL SELECT 'chunks', count(*)::int FROM chunks
  `);
  for (const { table, rows } of counts.rows) {
    console.log(`  ${table.padEnd(10)} ${rows} rows`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
