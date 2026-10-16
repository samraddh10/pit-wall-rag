/**
 * Shows which chunks of one season are closest in meaning to a question.
 * It only searches; no LLM is called.
 *
 * Usage: npm run search -- --season 2026 "What happens when a race is red-flagged?"
 */
import { parseArgs } from "node:util";
import { closeDb } from "../db/client.ts";
import { retrieve } from "../rag/retrieve.ts";

/** How much of each chunk to print: enough to tell what the rule is about. */
const EXCERPT_LENGTH = 200;

function parseCliArgs() {
  const { values, positionals } = parseArgs({
    options: { season: { type: "string" } },
    allowPositionals: true,
  });

  const season = Number(values.season);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    throw new Error("--season is required and must be a year, e.g. --season 2026");
  }

  const question = positionals.join(" ").trim();
  if (question === "") {
    throw new Error('Give a question, e.g. npm run search -- --season 2026 "What happens when a race is red-flagged?"');
  }

  return { season, question };
}

/** The chunk's text on one line, cut to EXCERPT_LENGTH characters. */
function excerpt(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= EXCERPT_LENGTH ? oneLine : `${oneLine.slice(0, EXCERPT_LENGTH)}…`;
}

async function main(): Promise<void> {
  const { season, question } = parseCliArgs();

  const results = await retrieve(question, season);
  if (results.length === 0) {
    console.log(`No chunks found for ${season}. Ingest it first: npm run ingest -- --season ${season}`);
    return;
  }

  console.log(`Top ${results.length} chunks in ${season} for "${question}"\n`);
  results.forEach((chunk, i) => {
    const part = chunk.chunkIndex > 0 ? ` (part ${chunk.chunkIndex + 1})` : "";
    console.log(
      `${String(i + 1).padStart(2)}. ${chunk.articleId}${part} · ${chunk.articleTitle ?? "untitled"} · ` +
        `p. ${chunk.page} · similarity ${chunk.similarity.toFixed(3)}`,
    );
    console.log(`    ${excerpt(chunk.content)}\n`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
