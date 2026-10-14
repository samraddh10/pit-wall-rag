import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanPages, fixSpacing } from "../src/ingest/clean.ts";
import type { PdfPage } from "../src/ingest/pdf.ts";

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

describe("cleanPages on the 2026 excerpt", () => {
  const result = cleanPages(loadFixture("sample-2026.txt"));
  const texts = result.lines.map((line) => line.text);

  it("skips the contents pages", () => {
    expect(result.contentsPages).toEqual([1, 2]);
    expect(result.lines.some((line) => line.page <= 2)).toBe(false);
  });

  it("removes the repeated page header, including page labels like B4 and B93", () => {
    expect(result.repeatedLines).toContain("B#");
    expect(result.repeatedLines).toContain("Issue #");
    expect(texts.filter((text) => /^B\d+$/.test(text))).toEqual([]);
    expect(texts).not.toContain("2026 Formula 1: Sporting Regulations");
    expect(texts).not.toContain("25 June 2026");
    expect(texts.filter((text) => text.startsWith("©"))).toEqual([]);
  });

  it("removes the header pieces of the late pages and the committee/governance tags", () => {
    expect(texts).not.toContain("SECTION B: SPORTING");
    expect(texts).not.toContain("0B");
    expect(texts.filter((text) => /^(Advisory Committee|Governance):/.test(text))).toEqual([]);
  });

  it("keeps the regulation text with the right page numbers", () => {
    expect(result.lines[0]).toEqual({ page: 4, text: "ARTICLE B1: ORGANISATION OF A COMPETITION" });
    expect(result.lines).toContainEqual({ page: 4, text: "B1.1 General Principles & Provisions" });
    expect(result.lines).toContainEqual({ page: 47, text: "B5.14.2 Suspension of a TTCS" });
    expect(result.lines).toContainEqual({ page: 47, text: "a. Overtaking is forbidden." });
    expect(result.lines).toContainEqual({ page: 90, text: "APPENDIX B4: PODIUM CEREMONY" });
  });
});

describe("cleanPages on the 2025 excerpt", () => {
  const result = cleanPages(loadFixture("sample-2025.txt"));
  const texts = result.lines.map((line) => line.text);

  it("skips the contents page", () => {
    expect(result.contentsPages).toEqual([1]);
  });

  it("removes the header on pages with 1-, 2- and 3-digit page numbers", () => {
    expect(result.repeatedLines).toContain("# Formula # Sporting Regulations #/# # April #");
    expect(texts.filter((text) => text.includes("Sporting Regulations"))).toEqual([]);
    expect(texts.filter((text) => text.startsWith("©"))).toEqual([]);
  });

  it("keeps the regulation text with the right page numbers", () => {
    expect(result.lines[0]?.page).toBe(3);
    expect(result.lines[0]?.text).toMatch(/^3\.4 All persons concerned/);
    expect(result.lines).toContainEqual({ page: 68, text: "57) SUSPENDING A SPRINT SESSION OR A RACE" });
    expect(result.lines).toContainEqual({ page: 119, text: "APPENDIX 9" });
    expect(texts.some((text) => text.startsWith("i) If the formation lap is started"))).toBe(true);
  });
});

describe("fixSpacing", () => {
  it("collapses runs of spaces and trims the ends", () => {
    expect(fixSpacing("  B5.14.2   Suspension  of a TTCS ")).toBe("B5.14.2 Suspension of a TTCS");
  });

  it("rejoins a hyphenated word split by a stray space", () => {
    expect(fixSpacing("the end -of-session signal")).toBe("the end-of-session signal");
  });

  it("leaves a real dash between words alone", () => {
    expect(fixSpacing("2026 FIA F1 Regulations - Section B")).toBe("2026 FIA F1 Regulations - Section B");
  });
});
