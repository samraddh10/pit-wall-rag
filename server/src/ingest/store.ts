import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { articles, chunks, seasons } from "../db/schema.ts";
import type { Article, Chunk } from "./chunk.ts";

/** Rows per INSERT. Keeps each statement well under Postgres's limit of 65,535 values. */
const BATCH_SIZE = 500;

/** One chunk ready to save: its text and its embedding. */
export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

/** Everything ingestion produced for one season. */
export interface SeasonData {
  season: number;
  issue: string | null;
  sourceFile: string;
  articles: Article[];
  chunks: EmbeddedChunk[];
}

/** What was in the database for this season before it was replaced, or null if it's new. */
export interface ReplacedSeason {
  articleCount: number;
  chunkCount: number;
}

/**
 * Saves one season, replacing any earlier copy of it.
 *
 * It all happens in one transaction: delete the season row (the database then deletes its
 * articles and chunks too, because of ON DELETE CASCADE), then insert the new rows.
 * If anything fails, Postgres undoes the whole thing and the old data stays as it was.
 * So re-running ingestion never leaves duplicates or a half-saved season.
 */
export async function storeSeason(data: SeasonData): Promise<ReplacedSeason | null> {
  return db.transaction(async (tx) => {
    const [replaced] = await tx
      .delete(seasons)
      .where(eq(seasons.season, data.season))
      .returning({ articleCount: seasons.articleCount, chunkCount: seasons.chunkCount });

    await tx.insert(seasons).values({
      season: data.season,
      issue: data.issue,
      sourceFile: data.sourceFile,
      articleCount: data.articles.length,
      chunkCount: data.chunks.length,
    });

    // Articles first: every chunk points at its article.
    for (const batch of inBatches(data.articles)) {
      await tx.insert(articles).values(
        batch.map((article) => ({
          season: data.season,
          articleId: article.articleId,
          parentId: article.parentId,
          title: article.title,
          level: article.level,
          position: article.position,
          page: article.page,
          body: article.body,
        })),
      );
    }

    // The chunk's header line is only used for embedding, so it isn't saved.
    for (const batch of inBatches(data.chunks)) {
      await tx.insert(chunks).values(
        batch.map((chunk) => ({
          season: data.season,
          articleId: chunk.articleId,
          chunkIndex: chunk.chunkIndex,
          parentId: chunk.parentId,
          articleTitle: chunk.articleTitle,
          page: chunk.page,
          content: chunk.content,
          embedding: chunk.embedding,
        })),
      );
    }

    return replaced ?? null;
  });
}

/** Splits a list into groups of BATCH_SIZE. */
function* inBatches<T>(items: T[]): Generator<T[]> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    yield items.slice(start, start + BATCH_SIZE);
  }
}
