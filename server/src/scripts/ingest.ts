/**
 * Loads one season's regulations PDF into the database.
 *
 * Usage: npm run ingest -- --season 2026 [--file path/to/file.pdf] [--dry-run]
 *
 * --file defaults to data/raw/<season>.pdf.
 * --dry-run skips embedding and the database, and instead writes what each
 * step produced to data/processed/ so it can be inspected.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chunkDocument, loadTokenCounter } from "../ingest/chunk.ts";
import { cleanPages, type CleanLine } from "../ingest/clean.ts";
import { readPdf } from "../ingest/pdf.ts";

// From server/src/scripts (or server/dist/scripts after a build) up to the project root.
const projectRoot = path.resolve(import.meta.dirname, "../../..");

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      season: { type: "string" },
      file: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const season = Number(values.season);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    throw new Error("--season is required and must be a year, e.g. --season 2026");
  }

  const file = values.file
    ? path.resolve(values.file)
    : path.join(projectRoot, "data", "raw", `${season}.pdf`);
  if (!existsSync(file)) {
    throw new Error(`PDF not found: ${file}\nDownload the FIA Sporting Regulations and save them there.`);
  }

  return { season, file, dryRun: values["dry-run"] };
}

/** Saves one step's output as readable JSON in data/processed/. */
async function writeDryRunFile(name: string, data: unknown): Promise<void> {
  const dir = path.join(projectRoot, "data", "processed");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`  wrote ${path.relative(projectRoot, filePath)}`);
}

/** Shows page numbers as short ranges: [1, 2, 3, 7] → "1–3, 7". */
function formatPages(pages: number[]): string {
  const ranges: [first: number, last: number][] = [];
  for (const page of pages) {
    const current = ranges.at(-1);
    if (current && page === current[1] + 1) current[1] = page;
    else ranges.push([page, page]);
  }
  return ranges.map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`)).join(", ") || "none";
}

/** Prints how many lines there are, then each one with its page, so they can be checked by eye. */
function printLines(label: string, lines: CleanLine[]): void {
  console.log(`  ${label}: ${lines.length === 0 ? "none" : lines.length}`);
  for (const { page, text } of lines) console.log(`    p. ${page}: ${text}`);
}

async function main(): Promise<void> {
  const { season, file, dryRun } = parseCliArgs();
  if (!dryRun) {
    throw new Error("Embedding and saving to the database aren't built yet. Run with --dry-run.");
  }

  console.log(`Reading ${path.relative(projectRoot, file)}`);
  const { pages, issue } = await readPdf(file);
  console.log(`  ${pages.length} pages, ${issue ?? "issue not found"}`);

  // Each page as a list of lines, so it's easy to see where every line starts.
  await writeDryRunFile(`${season}.pages.json`, {
    season,
    issue,
    pages: pages.map(({ page, text }) => ({ page, lines: text.split("\n") })),
  });

  console.log("Cleaning the text");
  const cleaned = cleanPages(pages);
  console.log(
    `  skipped contents page${cleaned.contentsPages.length === 1 ? "" : "s"} ${formatPages(cleaned.contentsPages)}, ` +
      `removed ${cleaned.removedRepeated} header/footer lines and ${cleaned.removedNoise} noise lines`,
  );
  console.log(`  ${cleaned.lines.length} lines of regulation text left`);
  await writeDryRunFile(`${season}.lines.json`, cleaned);

  console.log("Chunking by article");
  const countTokens = await loadTokenCounter();
  const { articles, chunks, report } = chunkDocument(cleaned.lines, countTokens);
  console.log(`  ${articles.length} articles, ${chunks.length} chunks`);
  console.log(
    report.skippedAppendix
      ? `  skipped ${report.skippedAppendix} and everything after it (${report.skippedLines} lines)`
      : "  skipped appendices: none",
  );
  printLines("heading-like lines kept as text", report.rejectedHeadings);
  printLines("lines before the first heading", report.linesBeforeFirstHeading);
  printLines("duplicate IDs", report.duplicateIds);
  await writeDryRunFile(`${season}.chunks.json`, { season, report, articles, chunks });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
