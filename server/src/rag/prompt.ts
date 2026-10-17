import type { RetrievedChunk } from "./retrieve.ts";

/** The exact reply for a question the given articles can't answer. citations.ts looks for it. */
export const NOT_FOUND_ANSWER = "Not found in the regulations.";

/**
 * The rules the model must follow for every answer. They are fixed, so they go in the
 * instructions (system prompt); the articles and the question change, so they go in the
 * user message.
 */
export const SYSTEM_PROMPT = `You answer questions about the FIA Formula 1 Sporting Regulations.

Rules:
1. Answer only from the articles in the user's message. Do not use outside knowledge, even if you know the answer.
2. Cite the article for every fact, using its label exactly as written, e.g. [Art. B5.14.2]. Put the citation right after the sentence it supports.
3. Cite only the labels you were given. An article's text may mention other articles (e.g. "Article B5.15"); you were not given those, so do not cite them.
4. If the articles do not contain the answer, reply exactly: ${NOT_FOUND_ANSWER}
5. Be concise: give the direct answer first, then only the details needed to support it.`;

/** What a context block needs from a retrieved chunk. */
export type ContextChunk = Pick<RetrievedChunk, "articleId" | "articleTitle" | "page" | "content">;

/** The label line the model sees above each chunk, e.g. "[Art. B5.14.2] Suspension Procedure(s) (p. 47)". */
export function contextLabel(chunk: ContextChunk): string {
  const title = chunk.articleTitle ? ` ${chunk.articleTitle}` : "";
  return `[Art. ${chunk.articleId}]${title} (p. ${chunk.page})`;
}

/** The user message: which season, the retrieved articles as labelled blocks, then the question. */
export function buildUserPrompt(question: string, season: number, chunks: ContextChunk[]): string {
  const blocks = chunks.map((chunk) => `${contextLabel(chunk)}\n${chunk.content}`);
  return [
    `Articles from the ${season} FIA Formula 1 Sporting Regulations:`,
    blocks.join("\n\n"),
    `Question: ${question}`,
  ].join("\n\n");
}
