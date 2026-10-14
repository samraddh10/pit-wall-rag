import type { PdfPage } from "./pdf.ts";

/** One line of regulation text and the page it came from. */
export interface CleanLine {
  page: number;
  text: string;
}

export interface CleanResult {
  lines: CleanLine[];
  /** Pages dropped because they belong to the table of contents. */
  contentsPages: number[];
  /** Header/footer lines found on at least half the pages, with numbers shown as "#". */
  repeatedLines: string[];
  /** How many header/footer lines were removed, counted over all pages. */
  removedRepeated: number;
  /** How many known noise lines were removed. */
  removedNoise: number;
}

/**
 * Lines that are never rules. 2026 puts committee and governance tags under
 * each article heading. On pages 90-99 of the 2026 PDF the page header comes
 * out as two pieces that are too rare for the repeated-line check to catch.
 */
const NOISE_LINES = [/^Advisory Committee:/, /^Governance:/, /^SECTION B: SPORTING$/, /^0B$/];

/** A contents line ends with a page number, e.g. "B1.2 FIA Delegates 4". */
const ENDS_WITH_PAGE_NUMBER = /\s\d{1,3}$/;

/**
 * Removes everything from the PDF text that isn't regulation text:
 * contents pages, repeated page headers/footers and known noise lines.
 * Every remaining line keeps the number of the page it came from.
 */
export function cleanPages(pages: PdfPage[]): CleanResult {
  const pageLines = pages.map(({ page, text }) => ({
    page,
    lines: text.split("\n").map(fixSpacing).filter((line) => line !== ""),
  }));

  const repeated = findRepeatedLines(pageLines.map(({ lines }) => lines));
  const result: CleanResult = {
    lines: [],
    contentsPages: [],
    repeatedLines: [...repeated],
    removedRepeated: 0,
    removedNoise: 0,
  };

  for (const { page, lines } of pageLines) {
    const kept: string[] = [];
    for (const line of lines) {
      if (repeated.has(maskNumbers(line))) {
        result.removedRepeated++;
      } else if (NOISE_LINES.some((pattern) => pattern.test(line))) {
        result.removedNoise++;
      } else {
        kept.push(line);
      }
    }

    if (isContentsPage(kept)) {
      result.contentsPages.push(page);
      continue;
    }
    result.lines.push(...kept.map((text) => ({ page, text })));
  }

  return result;
}

/** Collapses runs of spaces, trims the ends and rejoins split hyphens ("end -of" → "end-of"). */
export function fixSpacing(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\p{L}) -(\p{L})/gu, "$1-$2");
}

/**
 * Finds the lines that appear on at least half of all pages: titles, ©, dates,
 * page labels. Numbers are masked first, so "B4" and "B47", or "3/119" and
 * "111/119", count as the same line.
 */
function findRepeatedLines(pageLines: string[][]): Set<string> {
  const pagesWithLine = new Map<string, number>();
  for (const lines of pageLines) {
    // A Set, so a line repeated within one page still counts once for that page.
    for (const masked of new Set(lines.map(maskNumbers))) {
      pagesWithLine.set(masked, (pagesWithLine.get(masked) ?? 0) + 1);
    }
  }

  const minPages = pageLines.length / 2;
  return new Set(
    [...pagesWithLine].filter(([, count]) => count >= minPages).map(([masked]) => masked),
  );
}

/** Replaces every number with "#": "Issue 07" → "Issue #". */
function maskNumbers(line: string): string {
  return line.replace(/\d+/g, "#");
}

/** A contents page is one where most lines end with a page number. */
function isContentsPage(lines: string[]): boolean {
  const withPageNumber = lines.filter((line) => ENDS_WITH_PAGE_NUMBER.test(line)).length;
  return withPageNumber > lines.length / 2;
}
