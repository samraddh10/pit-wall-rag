/**
 * The shapes of the API's JSON responses.
 * This file holds types only, so the web app can import it with `import type`
 * without pulling in any server code or packages.
 */

/** GET /api/health */
export interface HealthResponse {
  ok: true;
}

/** One ingested regulations document. */
export interface SeasonSummary {
  season: number;
  /** e.g. "Issue 07"; null if it couldn't be read from the PDF. */
  issue: string | null;
  articleCount: number;
  chunkCount: number;
}

/** GET /api/seasons */
export interface SeasonsResponse {
  seasons: SeasonSummary[];
}

/** One numbered heading and its own text. */
export interface ArticleSection {
  articleId: string;
  title: string | null;
  body: string;
  page: number;
}

/**
 * GET /api/articles/:season/:articleId
 * `sections` holds the article itself first, then everything numbered under it, in document order.
 */
export interface ArticleResponse {
  season: number;
  articleId: string;
  title: string | null;
  parentId: string | null;
  page: number;
  sections: ArticleSection[];
}

/** The body of every error response (4xx and 5xx). */
export interface ErrorResponse {
  error: string;
  /** For 400s: which input was wrong and why. */
  issues?: { path: string; message: string }[];
}
