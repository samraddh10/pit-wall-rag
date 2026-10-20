import { cosineDistance, eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { chunks } from "../db/schema.ts";
import { embedQuestion } from "./embedder.ts";

/** How many chunks a question gets by default: enough to answer most questions, small enough for the LLM. */
export const DEFAULT_TOP_K = 5;

/** One chunk found for a question, with how close it is in meaning. */
export interface RetrievedChunk {
  season: number;
  articleId: string;
  chunkIndex: number;
  parentId: string | null;
  articleTitle: string | null;
  page: number;
  content: string;
  /** Cosine similarity to the question: 1 = same meaning, around 0 = unrelated. */
  similarity: number;
}

/**
 * Finds the k chunks of one season whose meaning is closest to the question.
 *
 * The question is embedded with the same model as the chunks, then Postgres compares it with
 * every chunk of that season (pgvector's `<=>` cosine distance operator) and keeps the closest.
 * There is no vector index, so this is an exact search: at a few hundred rows it takes
 * milliseconds and never misses a closer chunk.
 */
export async function retrieve(
  question: string,
  season: number,
  k: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  const questionVector = await embedQuestion(question);
  // Cosine distance is 0 for the same direction and grows as meanings drift apart.
  const distance = cosineDistance(chunks.embedding, questionVector);

  return db
    .select({
      season: chunks.season,
      articleId: chunks.articleId,
      chunkIndex: chunks.chunkIndex,
      parentId: chunks.parentId,
      articleTitle: chunks.articleTitle,
      page: chunks.page,
      content: chunks.content,
      similarity: sql<number>`1 - (${distance})`.mapWith(Number),
    })
    .from(chunks)
    .where(eq(chunks.season, season))
    .orderBy(distance)
    .limit(k);
}
