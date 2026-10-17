import { NOT_FOUND_ANSWER } from "./prompt.ts";
import type { RetrievedChunk } from "./retrieve.ts";

/** A citation that points to an article the model was actually given. */
export interface VerifiedCitation {
  season: number;
  articleId: string;
  title: string | null;
  page: number;
}

/** The result of checking an answer's citations against the retrieved chunks. */
export interface CitationCheck {
  verified: VerifiedCitation[];
  /** Cited IDs that were not retrieved: made up, or copied from a cross-reference. */
  rejected: string[];
  /** True when the model said the articles don't contain the answer. */
  notFound: boolean;
}

/** What the check needs from a retrieved chunk. */
export type CitableChunk = Pick<RetrievedChunk, "season" | "articleId" | "articleTitle" | "page">;

/**
 * A citation marker and what is inside its brackets. It accepts "[Art. B5.14.2]", "[Art B5.14.2]",
 * "[Article 57.2 a)]", "[Arts. B5.14.1, B5.14.2]" and "[Appendix B4]".
 * gpt-oss often writes its own bracket style, "【Art. B5.14.2】", even when shown "[ ]", so both count.
 * `\b` stops a word like "[Artwork]" from counting as "Art".
 */
const MARKER = /[[【]((?:Articles?|Arts?)\b\.?\s*[^\]】]+|Appendix\s+[^\]】]+)[\]】]/gi;

/** Separators between several IDs in one bracket: "B5.14.1, B5.14.2", "B5.14.1; B5.14.2", "… and …". */
const SEPARATOR = /\s*(?:[,;&/]|\band\b)\s*/i;

/** The "Art." or "Article" in front of an ID, also when repeated: "[Art. B5.14.1, Art. B5.14.2]". */
const PREFIX = /^(?:Articles?|Arts?)\b\.?\s*/i;

/** A lettered or numbered item on its own, like the "b)" in "[Art. 57.2 a), b)]". */
const ITEM_ONLY = /^\(?(?:[a-z]|[ivx]+)[.)]?$/i;

/**
 * The article ID at the start of a cited text: "B5.14.2" (2026), "57.2" (2025) or "Appendix B4".
 * Anything after it, such as an item letter in "57.2 a)" or "B5.14.2(a)", is not part of the ID.
 */
const ID_AT_START = /^(appendix\s+)?([a-z]?\d+(?:\.\d+)*)/i;

/** Turns a cited text into an article ID, or null if it doesn't start with one. */
function normalizeId(text: string): string | null {
  const match = ID_AT_START.exec(text);
  if (!match) return null;
  return `${match[1] ? "Appendix " : ""}${match[2]!.toUpperCase()}`;
}

/** Every article ID cited in a text, in order of first appearance, without duplicates. */
export function extractCitationIds(text: string): string[] {
  const ids = new Set<string>();
  for (const [, inside] of text.matchAll(MARKER)) {
    for (const part of inside!.split(SEPARATOR)) {
      const cited = part.replace(PREFIX, "").trim();
      if (cited === "" || ITEM_ONLY.test(cited)) continue;
      // Text that isn't an ID at all is kept as written, so it shows up as rejected.
      ids.add(normalizeId(cited) ?? cited);
    }
  }
  return [...ids];
}

/** "not found in the regulations", matched without caring about case or the full stop. */
const NOT_FOUND_TEXT = NOT_FOUND_ANSWER.replace(/\.$/, "").toLowerCase();

/**
 * Checks an answer's citations in code instead of trusting the model. A citation is verified only
 * if its article is one of the chunks we retrieved and showed to the model; every other ID is
 * rejected. Each verified citation takes its title and page from the best-matching chunk of that
 * article, and carries the season, so a citation always says which rulebook it points to.
 */
export function validateCitations(answer: string, retrieved: CitableChunk[]): CitationCheck {
  // Chunks are sorted best match first, so the first chunk seen for an article is its best one.
  const retrievedById = new Map<string, CitableChunk>();
  for (const chunk of retrieved) {
    if (!retrievedById.has(chunk.articleId)) retrievedById.set(chunk.articleId, chunk);
  }

  const verified: VerifiedCitation[] = [];
  const rejected: string[] = [];
  for (const id of extractCitationIds(answer)) {
    const chunk = retrievedById.get(id);
    if (chunk) {
      verified.push({ season: chunk.season, articleId: chunk.articleId, title: chunk.articleTitle, page: chunk.page });
    } else {
      rejected.push(id);
    }
  }

  return { verified, rejected, notFound: answer.toLowerCase().includes(NOT_FOUND_TEXT) };
}
