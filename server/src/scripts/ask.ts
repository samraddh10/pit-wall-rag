/**
 * Answers a question from one season's regulations and shows which citations were verified.
 * It calls the LLM once, so it uses one request of the free quota.
 *
 * Usage: npm run ask -- --season 2026 "How many power units can a driver use?"
 */
import { parseArgs } from "node:util";
import { closeDb } from "../db/client.ts";
import { answerQuestion } from "../rag/answer.ts";

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
    throw new Error('Give a question, e.g. npm run ask -- --season 2026 "How many power units can a driver use?"');
  }

  return { season, question };
}

async function main(): Promise<void> {
  const { season, question } = parseCliArgs();

  const { answer, citations } = await answerQuestion(question, season);

  console.log(`Question (${season}): ${question}\n`);
  console.log(`${answer}\n`);

  console.log("Verified citations:");
  if (citations.verified.length === 0) console.log("  none");
  for (const citation of citations.verified) {
    console.log(`  ${citation.season} Art. ${citation.articleId} · ${citation.title ?? "untitled"} · p. ${citation.page}`);
  }
  console.log(`Rejected IDs: ${citations.rejected.length > 0 ? citations.rejected.join(", ") : "none"}`);
  console.log(`Not found: ${citations.notFound ? "yes" : "no"}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
