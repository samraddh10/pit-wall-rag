/**
 * Measures how often search finds the right article for a question: the hit rate at 5.
 * It only searches; no LLM is called, so it uses none of the free quota.
 *
 * Usage: npm run eval:retrieval -- --season 2026
 *
 * The questions and the article IDs that answer them are in eval/questions.json.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb } from "../db/client.ts";
import { DEFAULT_TOP_K, retrieve } from "../rag/retrieve.ts";

// From server/src/scripts (or server/dist/scripts after a build) up to the project root.
const projectRoot = path.resolve(import.meta.dirname, "../../..");
const questionsFile = path.join(projectRoot, "eval", "questions.json");

/** The questions file is written by hand, so it is checked before any search runs. */
const questionsSchema = z.array(
  z.object({
    id: z.string().min(1),
    season: z.number().int(),
    question: z.string().min(1),
    expected: z.array(z.string().min(1)).min(1),
  }),
);

type EvalQuestion = z.infer<typeof questionsSchema>[number];

function parseCliArgs() {
  const { values } = parseArgs({
    options: { season: { type: "string" } },
  });

  const season = Number(values.season);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    throw new Error("--season is required and must be a year, e.g. --season 2026");
  }

  return { season };
}

/** Reads eval/questions.json and keeps the questions for one season. */
async function loadQuestions(season: number): Promise<EvalQuestion[]> {
  const result = questionsSchema.safeParse(JSON.parse(await readFile(questionsFile, "utf8")));
  if (!result.success) {
    throw new Error(`${path.relative(projectRoot, questionsFile)} is not valid:\n${z.prettifyError(result.error)}`);
  }
  return result.data.filter((question) => question.season === season);
}

/**
 * True when a retrieved article is one of the expected ones or sits under it,
 * so expected "B5.14" also accepts "B5.14.3".
 */
function matchesExpected(articleId: string, expected: string[]): boolean {
  return expected.some((id) => articleId === id || articleId.startsWith(`${id}.`));
}

async function main(): Promise<void> {
  const { season } = parseCliArgs();

  const questions = await loadQuestions(season);
  if (questions.length === 0) {
    throw new Error(`No questions for ${season} in ${path.relative(projectRoot, questionsFile)}`);
  }

  console.log(`Retrieval eval for ${season}: ${questions.length} questions, top ${DEFAULT_TOP_K} chunks each\n`);

  let hits = 0;
  for (const { id, question, expected } of questions) {
    const results = await retrieve(question, season, DEFAULT_TOP_K);
    if (results.length === 0) {
      throw new Error(`No chunks found for ${season}. Ingest it first: npm run ingest -- --season ${season}`);
    }

    // 1 means the top chunk is from an expected article; 0 means none of the chunks are.
    const rank = results.findIndex((chunk) => matchesExpected(chunk.articleId, expected)) + 1;
    if (rank > 0) hits++;

    console.log(`${id}  ${(rank > 0 ? `rank ${rank}` : "MISS").padEnd(6)}  ${question}`);
    if (rank === 0) {
      // Showing what came back instead makes a miss easy to look into.
      console.log(`${" ".repeat(id.length + 10)}expected ${expected.join(", ")} · got ${results.map((chunk) => chunk.articleId).join(", ")}`);
    }
  }

  const percent = Math.round((hits / questions.length) * 100);
  console.log(`\nHit rate@${DEFAULT_TOP_K}: ${hits}/${questions.length} (${percent}%)`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
