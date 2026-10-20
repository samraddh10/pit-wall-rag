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

/** POST /api/ask: the request body. */
export interface AskRequest {
  question: string;
  season: number;
}

/** One chunk found for the question, sent before the answer so the visitor can check it. */
export interface AskSource {
  season: number;
  articleId: string;
  /** The nearest titled heading, e.g. "Suspension Procedure(s)". */
  title: string | null;
  page: number;
  /** The chunk's text. */
  excerpt: string;
  /** How close the chunk is in meaning to the question: 1 = same meaning, around 0 = unrelated. */
  similarity: number;
}

/** A citation in the answer that points to one of the sources. */
export interface AskCitation {
  season: number;
  articleId: string;
  title: string | null;
  page: number;
}

/** The citation check, sent after the answer text is complete. */
export interface AskCitations {
  verified: AskCitation[];
  /** Cited IDs that weren't among the sources, so they can't be trusted. */
  rejected: string[];
  /** True when the answer is "Not found in the regulations." */
  notFound: boolean;
}

/**
 * The custom parts of the POST /api/ask stream, by name: "sources" arrives as a `data-sources`
 * part before the answer text, "citations" as a `data-citations` part after it.
 */
export type AskDataParts = {
  sources: AskSource[];
  citations: AskCitations;
};

/** The body of every error response (4xx and 5xx). */
export interface ErrorResponse {
  error: string;
  /** For 400s: which input was wrong and why. */
  issues?: { path: string; message: string }[];
}
