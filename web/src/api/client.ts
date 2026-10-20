import type {
  ArticleResponse,
  ErrorResponse,
  HealthResponse,
  SeasonsResponse,
} from "@shared/api-types.ts";

/**
 * Where the API server lives, e.g. "https://pitwall-api.onrender.com".
 * Empty in development: requests go to "/api/..." on Vite's own address, and Vite's proxy
 * forwards them to the local server (see vite.config.ts).
 */
const API_URL: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** The full address of an API path, e.g. apiUrl("/api/ask"). */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** The API replied with an error status. The message is the API's own explanation when it sent one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * GETs a JSON endpoint. Throws an ApiError for 4xx/5xx replies, and fetch's own TypeError when
 * the server can't be reached at all.
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path), { signal });
  if (!response.ok) {
    // Our API always sends { error }, but a proxy in front of it may send HTML or nothing.
    const body = (await response.json().catch(() => null)) as Partial<ErrorResponse> | null;
    throw new ApiError(response.status, body?.error ?? `The server replied with status ${response.status}`);
  }
  return (await response.json()) as T;
}

/** GET /api/health: resolves once the server is up. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson("/api/health", signal);
}

/** GET /api/seasons: the ingested seasons, newest first. */
export function getSeasons(signal?: AbortSignal): Promise<SeasonsResponse> {
  return getJson("/api/seasons", signal);
}

/** GET /api/articles/:season/:articleId: an article and everything numbered under it. */
export function getArticle(
  season: number,
  articleId: string,
  signal?: AbortSignal,
): Promise<ArticleResponse> {
  // IDs like "Appendix B1" contain a space, so the ID is encoded for the URL.
  return getJson(`/api/articles/${season}/${encodeURIComponent(articleId)}`, signal);
}
