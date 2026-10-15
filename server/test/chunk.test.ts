import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkDocument, loadTokenCounter, MAX_CHUNK_TOKENS, textToEmbed } from "../src/ingest/chunk.ts";
import { cleanPages, type CleanLine } from "../src/ingest/clean.ts";
import type { PdfPage } from "../src/ingest/pdf.ts";

// The real tokenizer, so the 256-token limit is checked the same way as in ingestion.
// It is downloaded on the first run, then read from the cache.
const countTokens = await loadTokenCounter();

/** Reads a fixture file, where each page starts with a line like "=== page 4 ===". */
function loadFixture(name: string): PdfPage[] {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  // split() with a capture group returns [comment, "4", page 4 text, "47", page 47 text, ...].
  const parts = text.replace(/\r\n/g, "\n").split(/^=== page (\d+) ===$/m).slice(1);
  const pages: PdfPage[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    pages.push({ page: Number(parts[i]), text: parts[i + 1] ?? "" });
  }
  return pages;
}

/** Clean lines that all come from one page, for the small hand-made examples. */
function onPage(page: number, ...texts: string[]): CleanLine[] {
  return texts.map((text) => ({ page, text }));
}

describe("chunkDocument on the 2026 excerpt", () => {
  const { articles, chunks, report } = chunkDocument(cleanPages(loadFixture("sample-2026.txt")).lines, countTokens);
  const article = (id: string) => articles.find((a) => a.articleId === id);

  it("finds every article in document order, with its parent, level and page", () => {
    expect(articles.map((a) => a.articleId)).toEqual([
      "B1", "B1.1", "B1.1.1", "B1.1.2", "B1.1.3",
      "B5", "B5.1", "B5.1.1", "B5.1.2", "B5.1.3", "B5.1.4",
      "B5.14", "B5.14.1", "B5.14.2",
      "Appendix B4",
    ]);
    expect(articles.map((a) => a.position)).toEqual(articles.map((_, index) => index));
    expect(article("B5")).toMatchObject({ parentId: null, level: 1, page: 34 });
    expect(article("B5.14")).toMatchObject({ parentId: "B5", level: 2, page: 47 });
    expect(article("B5.14.2")).toMatchObject({ parentId: "B5.14", level: 3, page: 47 });
  });

  it("uses the rest of a heading line as its title only when the heading has sub-clauses", () => {
    expect(article("B5")?.title).toBe("TOTAL TIME CLASSIFIED SESSIONS (TTCS)");
    expect(article("B5.14")?.title).toBe("Suspension Procedure(s)");
    expect(article("B5.14.2")?.title).toBeNull();
    expect(article("B5.14.2")?.body).toMatch(/^Suspension of a TTCS\nIf the Race Director deems/);
  });

  it("keeps lettered items inside their clause", () => {
    expect(article("B1.1.2")?.body).toContain("\na. The stewards or Race Director");
    expect(article("B1.1.2")?.body).toContain("\nb. All classifications and results");
    expect(article("B5.14.2")?.body).toContain("\na. Overtaking is forbidden.");
  });

  it("makes chunks only for articles that have text, with the nearest title and a header", () => {
    expect(chunks.some((c) => c.articleId === "B5" || c.articleId === "B5.14")).toBe(false);
    expect(chunks.find((c) => c.articleId === "B5.14.2")).toMatchObject({
      chunkIndex: 0,
      parentId: "B5.14",
      articleTitle: "Suspension Procedure(s)",
      page: 47,
      header: "B5.14.2 · TOTAL TIME CLASSIFIED SESSIONS (TTCS) › Suspension Procedure(s)",
    });
  });

  it("keeps every chunk within the model's token limit", () => {
    for (const chunk of chunks) {
      expect(countTokens(textToEmbed(chunk))).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
  });

  it("keeps an appendix whole under an 'Appendix' ID", () => {
    expect(article("Appendix B4")).toMatchObject({ parentId: null, level: 1, page: 90, title: "PODIUM CEREMONY" });
    expect(article("Appendix B4")?.body).toContain("\n1. MASTER OF CEREMONIES\n");
  });

  it("skips the future-changes appendix and everything after it", () => {
    expect(report.skippedAppendix).toBe("Appendix B5: APPROVED CHANGES TO SECTION B FOR SUBSEQUENT YEARS");
    expect(report.skippedLines).toBe(7);
    expect(articles.some((a) => a.page >= 93)).toBe(false);
    expect(chunks.some((c) => c.content.includes("Changes for 2027"))).toBe(false);
  });

  it("has nothing else to report", () => {
    expect(report.rejectedHeadings).toEqual([]);
    expect(report.linesBeforeFirstHeading).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
  });
});

describe("chunkDocument on the 2025 excerpt", () => {
  const { articles, chunks, report } = chunkDocument(cleanPages(loadFixture("sample-2025.txt")).lines, countTokens);
  const article = (id: string) => articles.find((a) => a.articleId === id);

  it("finds the old-style articles and clauses", () => {
    expect(articles.map((a) => a.articleId)).toEqual([
      "4", "4.1", "4.2",
      "5", "5.1", "5.2", "5.3",
      "57", "57.1", "57.2",
      "Appendix 8",
    ]);
    expect(article("57")).toMatchObject({ parentId: null, level: 1, page: 68, title: "SUSPENDING A SPRINT SESSION OR A RACE" });
    expect(article("57.2")).toMatchObject({ parentId: "57", level: 2, page: 68, title: null });
    expect(article("57.2")?.body).toMatch(/^When the signal is given overtaking is forbidden/);
  });

  it("keeps a) and i) items inside their clause", () => {
    expect(article("5.3")?.body).toContain("\na) The distance of each sprint session");
    expect(article("5.3")?.body).toContain("\ni) If the formation lap is started");
    expect(article("5.3")?.body).toContain("\nii) Should one (1) hour elapse");
  });

  it("gives chunks the article title as their nearest title", () => {
    expect(chunks.find((c) => c.articleId === "57.2")).toMatchObject({
      articleTitle: "SUSPENDING A SPRINT SESSION OR A RACE",
      page: 68,
      header: "57.2 · SUSPENDING A SPRINT SESSION OR A RACE",
    });
  });

  it("reads an appendix title from the line after 'APPENDIX 8'", () => {
    expect(article("Appendix 8")).toMatchObject({ page: 111, title: "POWER UNIT TEST BENCH RESTRICTIONS" });
    expect(article("Appendix 8")?.body).toMatch(/^1 Engine dyno test limitations\na\) Definitions:/);
  });

  it("skips the future-changes appendix", () => {
    expect(report.skippedAppendix).toBe("Appendix 9: APPROVED CHANGES FOR SUBSEQUENT YEARS");
    expect(articles.some((a) => a.page === 119)).toBe(false);
  });

  it("reports the text before the first heading and a wrapped line that starts with a number", () => {
    // The excerpt starts in the middle of article 3, whose heading isn't in it.
    expect(report.linesBeforeFirstHeading[0]?.text).toMatch(/^3\.4 All persons concerned/);
    expect(report.linesBeforeFirstHeading).toHaveLength(9);
    expect(report.rejectedHeadings.map((line) => line.text)).toContain(
      "54.3 the stewards may impose penalty points on a driver’s Super Licence. If a driver accrues",
    );
    expect(article("4.2")?.body).toContain("\n54.3 the stewards may impose penalty points");
  });
});

describe("the in-order rule", () => {
  const { articles, report } = chunkDocument(
    onPage(
      38,
      "ARTICLE B5: TOTAL TIME CLASSIFIED SESSIONS (TTCS)",
      "B5.7 Start Procedure",
      "B5.7.1 If an extra formation lap is required, the procedures defined in Article",
      "B5.9 will be followed.",
      "B5.8 Aborted Start",
      "B5.8.1 If the start is aborted, the procedures of Article",
      "B5.6 Formation Lap(s) also apply.",
      "B5.8.2 A driver who caused an aborted start must follow Article",
      "B5.7.2 Start Procedure.",
    ),
    countTokens,
  );
  const rejected = report.rejectedHeadings.map((line) => line.text);
  const body = (id: string) => articles.find((a) => a.articleId === id)?.body;

  it("accepts the real headings", () => {
    expect(articles.map((a) => a.articleId)).toEqual(["B5", "B5.7", "B5.7.1", "B5.8", "B5.8.1", "B5.8.2"]);
  });

  it("rejects a wrapped reference to a later clause, because it continues a sentence", () => {
    expect(rejected).toContain("B5.9 will be followed.");
    expect(body("B5.7.1")).toMatch(/Article\nB5\.9 will be followed\.$/);
  });

  it("rejects a heading whose number comes before its previous sibling's", () => {
    expect(rejected).toContain("B5.6 Formation Lap(s) also apply.");
    expect(body("B5.8.1")).toMatch(/\nB5\.6 Formation Lap\(s\) also apply\.$/);
  });

  it("rejects a heading whose parent is no longer open", () => {
    expect(rejected).toContain("B5.7.2 Start Procedure.");
    expect(body("B5.8.2")).toMatch(/\nB5\.7\.2 Start Procedure\.$/);
  });

  it("reports a heading that repeats an ID instead of using it twice", () => {
    const repeated = chunkDocument(
      onPage(4, "ARTICLE B1: ORGANISATION OF A COMPETITION", "B1.1 General Principles", "B1.1.1 A Competition starts.", "B1.1 General Principles"),
      countTokens,
    );
    expect(repeated.report.duplicateIds).toEqual([{ page: 4, text: "B1.1 General Principles" }]);
    expect(repeated.articles.map((a) => a.articleId)).toEqual(["B1", "B1.1", "B1.1.1"]);
  });

  it("doesn't split an appendix by its own numbers, so they can't clash with article numbers", () => {
    const { articles: withAppendix, report: appendixReport } = chunkDocument(
      [
        ...onPage(2, "1) REGULATIONS", "1.1 The FIA will organise the FIA Formula One World Championship."),
        ...onPage(86, "APPENDIX 2: PARC FERME PERMITTED WORKS", "1. BRAKES", "1.1 Brake friction material may be removed."),
      ],
      countTokens,
    );
    expect(withAppendix.map((a) => a.articleId)).toEqual(["1", "1.1", "Appendix 2"]);
    expect(withAppendix.at(-1)?.body).toBe("1. BRAKES\n1.1 Brake friction material may be removed.");
    expect(appendixReport.duplicateIds).toEqual([]);
  });
});

describe("splitting a long clause", () => {
  const sentence = "The Race Director may suspend the session if the track cannot be negotiated safely.";

  /** Every chunk of one article, after checking they're numbered 0, 1, 2… and fit the model. */
  function chunksOf(lines: CleanLine[], articleId: string) {
    const pieces = chunkDocument(lines, countTokens).chunks.filter((c) => c.articleId === articleId);
    expect(pieces.map((c) => c.chunkIndex)).toEqual(pieces.map((_, index) => index));
    for (const piece of pieces) {
      expect(countTokens(textToEmbed(piece))).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
    return pieces;
  }

  it("cuts before lettered items, keeping the ID and each piece's own page", () => {
    const items = [..."abcdefgh"].map((letter) => `${letter}. ${sentence} ${sentence}`);
    const lines = [
      ...onPage(50, "ARTICLE B5: TOTAL TIME CLASSIFIED SESSIONS (TTCS)", "B5.15 Resumption Procedure"),
      ...onPage(50, "B5.15.2 When the signal is given:", ...items.slice(0, 4)),
      ...onPage(51, ...items.slice(4)),
    ];
    const pieces = chunksOf(lines, "B5.15.2");

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0]?.content).toMatch(/^When the signal is given:\na\. /);
    for (const piece of pieces.slice(1)) expect(piece.content).toMatch(/^[a-h]\. /);
    expect(pieces.at(-1)?.page).toBe(51);
    // Nothing lost or repeated: the pieces add up to the whole clause.
    expect(pieces.map((c) => c.content).join("\n")).toBe(["When the signal is given:", ...items].join("\n"));
  });

  it("cuts an item that is still too long into sentences, keeping its marker with its text", () => {
    const body = ["When the signal is given:", "f.", ...Array<string>(20).fill(sentence)];
    const lines = onPage(
      50,
      "ARTICLE B5: TOTAL TIME CLASSIFIED SESSIONS (TTCS)",
      "B5.15 Resumption Procedure",
      `B5.15.2 ${body[0]}`,
      ...body.slice(1),
    );
    const pieces = chunksOf(lines, "B5.15.2");

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0]?.content).toMatch(/^When the signal is given:\nf\.\nThe Race Director/);
    for (const piece of pieces) expect(piece.content).not.toMatch(/f\.$/);
    for (const piece of pieces.slice(1)) expect(piece.content).toMatch(/^The Race Director/);
    // Pieces can now start mid-line, so compare the words only.
    const words = (text: string) => text.split(/\s+/).join(" ");
    expect(words(pieces.map((c) => c.content).join(" "))).toBe(words(body.join(" ")));
  });

  it("never leaves a list marker at the end of a piece, away from its text", () => {
    // Counting words instead of tokens makes the cut land exactly where we want it:
    // after item e there is room for "f." but not for the sentence after it.
    const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
    const lines = onPage(
      50,
      "ARTICLE B5: TOTAL TIME CLASSIFIED SESSIONS (TTCS)",
      "B5.15 Resumption Procedure",
      "B5.15.2 When the signal is given:",
      `e. ${Array<string>(235).fill("word").join(" ")}`,
      "f.",
      ...Array<string>(20).fill(sentence),
    );
    const pieces = chunkDocument(lines, countWords).chunks.filter((c) => c.articleId === "B5.15.2");

    expect(pieces[0]?.content).toMatch(/ word$/);
    expect(pieces[1]?.content).toMatch(/^f\.\nThe Race Director/);
  });
});
