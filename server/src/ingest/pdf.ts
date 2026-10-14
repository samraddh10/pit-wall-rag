import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

/** The raw text of one PDF page, exactly as the PDF gave it. */
export interface PdfPage {
  /** 1-based, like the page numbers a PDF viewer shows. */
  page: number;
  /** The page's text, one line of the PDF per line of text. */
  text: string;
}

export interface PdfDocument {
  pages: PdfPage[];
  /** For example "Issue 07", or null if page 1 doesn't say. */
  issue: string | null;
}

/**
 * Reads a regulations PDF and returns the text of each page.
 *
 * Pages stay separate (instead of one long string) so later steps can
 * remember which page every line came from, for citations like "p. 47".
 */
export async function readPdf(filePath: string): Promise<PdfDocument> {
  const bytes = new Uint8Array(await readFile(filePath));
  // verbosity 0 hides PDF.js font warnings that don't affect the text.
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });

  // Per page, unpdf ends each PDF text line with "\n", so line breaks are kept.
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((pageText, index) => ({ page: index + 1, text: pageText }));

  return { pages, issue: findIssue(pages[0]?.text ?? "") };
}

/** Finds the issue label on the cover page, e.g. "Issue 07" (2026) or "Issue 5" (2025). */
export function findIssue(firstPageText: string): string | null {
  const match = /\bIssue\s+(\d+)\b/i.exec(firstPageText);
  return match ? `Issue ${match[1]}` : null;
}
