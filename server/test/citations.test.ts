import { describe, expect, it } from "vitest";
import { extractCitationIds, validateCitations, type CitableChunk } from "../src/rag/citations.ts";
import { NOT_FOUND_ANSWER } from "../src/rag/prompt.ts";

/** Retrieved chunks, best match first, as retrieve() returns them. B5.14.2 was split into two chunks. */
const retrieved2026: CitableChunk[] = [
  { season: 2026, articleId: "B5.14.2", articleTitle: "Suspension Procedure(s)", page: 47 },
  { season: 2026, articleId: "B5.14.1", articleTitle: "Suspension Procedure(s)", page: 47 },
  { season: 2026, articleId: "B5.14.2", articleTitle: "Suspension Procedure(s)", page: 48 },
  { season: 2026, articleId: "Appendix B4", articleTitle: "Points Scoring", page: 92 },
];

const retrieved2025: CitableChunk[] = [
  { season: 2025, articleId: "57.2", articleTitle: "SUSPENDING A RACE", page: 51 },
  { season: 2025, articleId: "57.3", articleTitle: "SUSPENDING A RACE", page: 51 },
];

describe("validateCitations", () => {
  it("keeps citations of retrieved articles, with their season, title and page", () => {
    const answer = "The race is suspended with red flags [Art. B5.14.2].";
    expect(validateCitations(answer, retrieved2026)).toEqual({
      verified: [{ season: 2026, articleId: "B5.14.2", title: "Suspension Procedure(s)", page: 47 }],
      rejected: [],
      notFound: false,
    });
  });

  it("drops made-up IDs and cross-references that were not retrieved", () => {
    const answer = "Cars stop in the pit lane [Art. B5.14.1]. Then B5.15 applies [Art. B5.15] [Art. B9.99.9].";
    const check = validateCitations(answer, retrieved2026);
    expect(check.verified.map((c) => c.articleId)).toEqual(["B5.14.1"]);
    expect(check.rejected).toEqual(["B5.15", "B9.99.9"]);
  });

  it("removes item suffixes so the clause ID matches", () => {
    const answer = "See [Art. 57.2 a)], [Article 57.3(b)] and [Art. 57.2 b)].";
    const check = validateCitations(answer, retrieved2025);
    expect(check.verified).toEqual([
      { season: 2025, articleId: "57.2", title: "SUSPENDING A RACE", page: 51 },
      { season: 2025, articleId: "57.3", title: "SUSPENDING A RACE", page: 51 },
    ]);
    expect(check.rejected).toEqual([]);
  });

  it("merges duplicates, keeping the order of first appearance", () => {
    const answer = "[Art. B5.14.1] first, then [Art. B5.14.2], then [Art. B5.14.1] again and [Art. X1] [Art. X1].";
    const check = validateCitations(answer, retrieved2026);
    expect(check.verified.map((c) => c.articleId)).toEqual(["B5.14.1", "B5.14.2"]);
    expect(check.rejected).toEqual(["X1"]);
  });

  it("reports the not-found reply, with no citations", () => {
    expect(validateCitations(NOT_FOUND_ANSWER, retrieved2026)).toEqual({ verified: [], rejected: [], notFound: true });
    expect(validateCitations("not found in the regulations", retrieved2026).notFound).toBe(true);
  });

  it("finds nothing in an answer without markers", () => {
    expect(validateCitations("Red flags mean the session is suspended.", retrieved2026)).toEqual({
      verified: [],
      rejected: [],
      notFound: false,
    });
  });
});

describe("extractCitationIds", () => {
  it('accepts "Art", "Art." and "Article", in any case', () => {
    expect(extractCitationIds("[Art B5.14.1] [art. b5.14.2] [Article Appendix B4] [ARTICLE 57.2]")).toEqual([
      "B5.14.1",
      "B5.14.2",
      "Appendix B4",
      "57.2",
    ]);
  });

  it("splits several IDs in one bracket", () => {
    expect(extractCitationIds("[Art. B5.14.1, B5.14.2]")).toEqual(["B5.14.1", "B5.14.2"]);
    expect(extractCitationIds("[Arts. B5.14.1; Art. B5.14.2 and B5.14.3]")).toEqual(["B5.14.1", "B5.14.2", "B5.14.3"]);
    expect(extractCitationIds("[Art. 57.2 a), b)]")).toEqual(["57.2"]);
  });

  it("accepts the 【】 brackets gpt-oss often uses", () => {
    expect(extractCitationIds("Cars line up on the grid【Art. B5.14.2】 [Art. B5.14.1]【Art. B2.5.3, B5.14.2】")).toEqual([
      "B5.14.2",
      "B5.14.1",
      "B2.5.3",
    ]);
  });

  it("reads appendix citations with or without Art.", () => {
    expect(extractCitationIds("[Art. Appendix B4] [Appendix B4] [Appendix 8]")).toEqual(["Appendix B4", "Appendix 8"]);
  });

  it("ignores brackets that are not citations", () => {
    expect(extractCitationIds("[Artwork] [note] [1] B5.14.2 without brackets")).toEqual([]);
  });

  it("keeps text that is not an ID as written, so it can be rejected", () => {
    expect(extractCitationIds("[Art. Safety Car]")).toEqual(["Safety Car"]);
  });
});
