import { desc } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/client.ts";
import { seasons } from "../../db/schema.ts";
import type { SeasonsResponse } from "../../shared/api-types.ts";

export const seasonsRouter = Router();

/** Lists the ingested seasons, newest first, for the season selector. */
seasonsRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({
      season: seasons.season,
      issue: seasons.issue,
      articleCount: seasons.articleCount,
      chunkCount: seasons.chunkCount,
    })
    .from(seasons)
    .orderBy(desc(seasons.season));

  const body: SeasonsResponse = { seasons: rows };
  res.json(body);
});
