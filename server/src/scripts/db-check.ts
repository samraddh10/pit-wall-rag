/**
 * Quick health check for the database:
 * is it reachable, is pgvector installed, and how many rows does each table
 * (and each season) have?
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

  // Counts the rows each season really has, rather than trusting the totals saved in `seasons`.
  const perSeason = await db.execute<{ season: number; issue: string | null; articles: number; chunks: number }>(sql`
    SELECT s.season, s.issue,
      (SELECT count(*)::int FROM articles a WHERE a.season = s.season) AS articles,
      (SELECT count(*)::int FROM chunks c WHERE c.season = s.season) AS chunks
    FROM seasons s
    ORDER BY s.season
  `);
  console.log(perSeason.rows.length === 0 ? "No seasons ingested yet." : "Per season:");
  for (const { season, issue, articles, chunks } of perSeason.rows) {
    console.log(`  ${season} (${issue ?? "issue unknown"}): ${articles} articles, ${chunks} chunks`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
