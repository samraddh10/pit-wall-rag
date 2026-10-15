import { AutoTokenizer } from "@huggingface/transformers";
import type { CleanLine } from "./clean.ts";

/** The embedding model. Its tokenizer decides how much text fits in one chunk. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** all-MiniLM-L6-v2 reads at most 256 tokens; anything after that would be ignored. */
export const MAX_CHUNK_TOKENS = 256;

/** Counts the tokens in a text the way the embedding model does. */
export type TokenCounter = (text: string) => number;

/** One numbered heading of the regulations and the text that belongs directly to it. */
export interface Article {
  /** "B5.14.2" (2026), "57.2" (2025) or "Appendix B1". */
  articleId: string;
  /** "B5.14" for "B5.14.2"; null for top-level articles and appendices. */
  parentId: string | null;
  /** The heading's title, or null when the heading line starts the text instead (like "57.2 When…"). */
  title: string | null;
  /** 1 for B5, 57 and appendices, 2 for B5.14, 3 for B5.14.2… */
  level: number;
  /** Order in the document, starting at 0. */
  position: number;
  /** Page the heading is on. */
  page: number;
  /** This article's own text, without its sub-clauses. One PDF line per line. */
  body: string;
}

/** One searchable piece of an article. A long clause becomes several chunks with the same articleId. */
export interface Chunk {
  articleId: string;
  /** 0, 1, 2… when a long clause was split, otherwise 0. */
  chunkIndex: number;
  parentId: string | null;
  /** Title of the nearest heading that has one, e.g. "Suspension Procedure(s)" for B5.14.2. */
  articleTitle: string | null;
  /** Page this piece starts on. */
  page: number;
  /** The text of this piece, exactly as it appears in the article's body. */
  content: string;
  /**
   * The article ID and its headings' titles, e.g. "B5.14.2 · TOTAL TIME CLASSIFIED SESSIONS (TTCS) ›
   * Suspension Procedure(s)". Embedded together with the content, so a short clause still says
   * what it is about, but not stored.
   */
  header: string;
}

export interface ChunkReport {
  /** Lines that looked like headings but broke the in-order rule, so they were kept as text. */
  rejectedHeadings: CleanLine[];
  /** Lines before the first heading. They belong to no article, so they are left out. */
  linesBeforeFirstHeading: CleanLine[];
  /** Heading lines whose ID was already used, kept as text. */
  duplicateIds: CleanLine[];
  /** The "approved changes for subsequent years" appendix, left out with everything after it. */
  skippedAppendix: string | null;
  /** How many lines were left out that way. */
  skippedLines: number;
}

export interface ChunkResult {
  articles: Article[];
  chunks: Chunk[];
  report: ChunkReport;
}

/** "ARTICLE B5: TOTAL TIME CLASSIFIED SESSIONS (TTCS)" (2026). */
const ARTICLE_2026 = /^ARTICLE (B\d+): (.+)$/;
/**
 * "57) SUSPENDING A SPRINT SESSION OR A RACE" (2025). The title is in capitals, which tells it
 * apart from a wrapped sentence that happens to start with "49) the number of laps".
 */
const ARTICLE_2025 = /^(\d+)\) ([A-Z][^a-z]*)$/;
/** "B5.14 Suspension Procedure(s)", "B5.14.2 If the Race Director…" or "57.2 When the signal…". */
const CLAUSE = /^(B?\d+(?:\.\d+)+)(?: (.*))?$/;
/** "APPENDIX B1: DEFINITIONS" (2026) or "APPENDIX 8", with the title on the next line (2025). */
const APPENDIX = /^APPENDIX (B?\d+)(?:: (.*))?$/;
/** The appendix that holds the rules for later seasons. Its rules would give wrong answers. */
const FUTURE_CHANGES = /^APPROVED CHANGES\b.*\bSUBSEQUENT YEARS$/;
/** A lettered item inside a clause: "a." "b)" "i)" "iv)". */
const LETTERED_ITEM = /^(?:[a-z]|[ivx]+)[.)](?:\s|$)/;
/** A list marker on its own, without its text: "f." "iv)" "1.". */
const LIST_MARKER = /^(?:[a-z]|[ivx]+|\d+)[.)]$/;

const sentences = new Intl.Segmenter("en", { granularity: "sentence" });

/** Loads the embedding model's tokenizer (downloaded once, then read from the cache). */
export async function loadTokenCounter(): Promise<TokenCounter> {
  const tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_MODEL);
  return (text) => tokenizer.encode(text).length;
}

/** The text that gets embedded for a chunk: its header line, then its content. */
export function textToEmbed(chunk: Pick<Chunk, "header" | "content">): string {
  return `${chunk.header}\n${chunk.content}`;
}

/**
 * Turns the clean lines of one regulations document into its outline of numbered articles
 * and the chunks to search, using the FIA's own article numbering.
 */
export function chunkDocument(lines: CleanLine[], countTokens: TokenCounter): ChunkResult {
  const { sections, report } = findSections(lines);
  const parentIds = new Set(sections.map((section) => section.parentId));

  const articles: Article[] = [];
  const bodies = new Map<string, CleanLine[]>();
  sections.forEach((section, position) => {
    // Title rule: the rest of the heading line is a title if the heading has sub-clauses.
    // Otherwise it is the first line of the text ("57.2 When the signal is given…").
    // Appendices are never split, so their title is always kept.
    const isTitled = section.isAppendix || parentIds.has(section.articleId);
    const bodyLines =
      isTitled || section.rest === "" ? section.lines : [{ page: section.page, text: section.rest }, ...section.lines];

    articles.push({
      articleId: section.articleId,
      parentId: section.parentId,
      title: isTitled && section.rest !== "" ? section.rest : null,
      level: section.level,
      position,
      page: section.page,
      body: bodyLines.map((line) => line.text).join("\n"),
    });
    bodies.set(section.articleId, bodyLines);
  });

  const byId = new Map(articles.map((article) => [article.articleId, article]));
  const chunks: Chunk[] = [];
  for (const article of articles) {
    const bodyLines = bodies.get(article.articleId) ?? [];
    if (bodyLines.length === 0) continue;

    // Titles from the top-level article down to this one, e.g. ["TOTAL TIME…", "Suspension Procedure(s)"].
    const titles = headingPath(article, byId).flatMap((heading) => (heading.title ? [heading.title] : []));
    const header = titles.length > 0 ? `${article.articleId} · ${titles.join(" › ")}` : article.articleId;

    splitToFit(bodyLines, header, countTokens).forEach((piece, chunkIndex) => {
      chunks.push({
        articleId: article.articleId,
        chunkIndex,
        parentId: article.parentId,
        articleTitle: titles.at(-1) ?? null,
        page: piece.page,
        content: piece.text,
        header,
      });
    });
  }

  return { articles, chunks, report };
}

/** A line that looks like a heading, before the in-order rule has accepted it. */
interface Heading {
  articleId: string;
  parentId: string | null;
  level: number;
  /** What comes after the number on the heading line: a title, or the first line of the text. */
  rest: string;
  /** "B" (2026) or "" (2025). Siblings must share it. */
  prefix: string;
  /** The last number of the ID: 14 for "B5.14". Siblings must count upwards. */
  number: number;
}

/** An accepted heading, with the page it is on and the lines that follow it. */
interface Section extends Heading {
  page: number;
  isAppendix: boolean;
  lines: CleanLine[];
}

/**
 * Reads the lines in order and decides which lines are headings. A heading-like line is accepted
 * only if its parent is open (on the current path) and its number comes after the previous
 * sibling's (the in-order rule), and its text doesn't start with a small letter. That rejects
 * wrapped lines that happen to start with an article number, like "B5.15.2 shall remain…".
 */
function findSections(lines: CleanLine[]): { sections: Section[]; report: ChunkReport } {
  const report: ChunkReport = {
    rejectedHeadings: [],
    linesBeforeFirstHeading: [],
    duplicateIds: [],
    skippedAppendix: null,
    skippedLines: 0,
  };
  const sections: Section[] = [];
  const usedIds = new Set<string>();
  // The last accepted heading under each parent (null = top level), to compare siblings.
  const lastChild = new Map<string | null, Heading>();
  let lastAppendix: Heading | undefined;
  // The open headings, e.g. [B5, B5.14, B5.14.2]. Lines go into the last one.
  let path: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const inAppendix = path[0]?.isAppendix ?? false;
    // Inside an appendix only a new appendix starts a section. Its own numbers ("1.1") would
    // clash with article numbers, so they stay part of the text.
    const heading = matchAppendix(line.text) ?? (inAppendix ? null : matchNumberedHeading(line.text));

    if (heading) {
      const isAppendix = heading.articleId.startsWith("Appendix");
      const parentIndex = path.findIndex((section) => section.articleId === heading.parentId);
      const parentIsOpen = heading.parentId === null || parentIndex !== -1;
      const previous = isAppendix ? lastAppendix : lastChild.get(heading.parentId);
      const inOrder = !previous || (previous.prefix === heading.prefix && heading.number > previous.number);

      if (/^[a-z]/.test(heading.rest)) {
        // A heading starts a sentence. A wrapped cross-reference continues one ("…defined in
        // Article" / "B5.9 will be followed."), which the in-order rule alone can't catch.
        report.rejectedHeadings.push(line);
      } else if (usedIds.has(heading.articleId)) {
        report.duplicateIds.push(line);
      } else if (!parentIsOpen || !inOrder) {
        report.rejectedHeadings.push(line);
      } else {
        const headingIndex = i;
        // 2025 appendices have their title on the line after "APPENDIX 8".
        if (isAppendix && heading.rest === "" && i + 1 < lines.length) {
          heading.rest = lines[++i]!.text;
        }
        if (isAppendix && FUTURE_CHANGES.test(heading.rest)) {
          report.skippedAppendix = `${heading.articleId}: ${heading.rest}`;
          report.skippedLines = lines.length - headingIndex;
          break;
        }

        const section: Section = { ...heading, page: line.page, isAppendix, lines: [] };
        sections.push(section);
        usedIds.add(heading.articleId);
        if (isAppendix) lastAppendix = heading;
        else lastChild.set(heading.parentId, heading);
        // Close everything below the parent, then open the new heading.
        path = [...path.slice(0, parentIndex + 1), section];
        continue;
      }
    }

    const current = path.at(-1);
    if (current) current.lines.push(line);
    else report.linesBeforeFirstHeading.push(line);
  }

  return { sections, report };
}

function matchAppendix(text: string): Heading | null {
  const match = APPENDIX.exec(text);
  if (!match) return null;
  const [, id = "", rest = ""] = match;
  return { ...splitId(id), articleId: `Appendix ${id}`, parentId: null, level: 1, rest };
}

function matchNumberedHeading(text: string): Heading | null {
  const match = ARTICLE_2026.exec(text) ?? ARTICLE_2025.exec(text) ?? CLAUSE.exec(text);
  if (!match) return null;
  const [, id = "", rest = ""] = match;
  const { prefix, numbers, number } = splitId(id);
  return {
    articleId: id,
    parentId: numbers.length > 1 ? prefix + numbers.slice(0, -1).join(".") : null,
    level: numbers.length,
    rest,
    prefix,
    number,
  };
}

/** "B5.14" → prefix "B", numbers [5, 14], number 14. "57.2" → prefix "", numbers [57, 2], number 2. */
function splitId(id: string) {
  const prefix = id.startsWith("B") ? "B" : "";
  const numbers = id.slice(prefix.length).split(".").map(Number);
  return { prefix, numbers, number: numbers.at(-1) ?? 0 };
}

/** The article and every heading above it, top level first: [B5, B5.14, B5.14.2]. */
function headingPath(article: Article, byId: Map<string, Article>): Article[] {
  const path = [article];
  for (let parentId = article.parentId; parentId !== null; ) {
    const parent = byId.get(parentId);
    if (!parent) break;
    path.unshift(parent);
    parentId = parent.parentId;
  }
  return path;
}

/** A piece of a clause's text, as start and end positions in that text. */
interface Span {
  start: number;
  end: number;
}

/**
 * Cuts a clause's text into pieces that each fit in the model's 256 tokens, header included.
 * A clause that fits stays whole. Longer ones are cut before each lettered item, then items
 * that are still too long are cut into sentences. Neighbouring pieces are then joined back
 * together for as long as they fit, so pieces are as big as allowed.
 */
function splitToFit(lines: CleanLine[], header: string, countTokens: TokenCounter): { page: number; text: string }[] {
  const text = lines.map((line) => line.text).join("\n");
  const lineStarts: number[] = [];
  let position = 0;
  for (const line of lines) {
    lineStarts.push(position);
    position += line.text.length + 1;
  }

  const fits = ({ start, end }: Span) =>
    countTokens(textToEmbed({ header, content: text.slice(start, end) })) <= MAX_CHUNK_TOKENS;

  // 1. Cut before every lettered item.
  const cuts = lineStarts.filter((start, i) => i > 0 && LETTERED_ITEM.test(lines[i]!.text));
  const items = [0, ...cuts].map((start, i) => ({ start, end: cuts[i] ?? text.length }));

  // 2. Cut items that are still too long into sentences.
  const units = items.flatMap((item) => (fits(item) ? [item] : sentenceSpans(text, item)));

  // 3. Join neighbours back together while they fit.
  const pieces: Span[] = [];
  for (const unit of units) {
    const last = pieces.at(-1);
    if (last && fits({ start: last.start, end: unit.end })) last.end = unit.end;
    else pieces.push({ ...unit });
  }

  return pieces.flatMap(({ start, end }) => {
    const raw = text.slice(start, end);
    const pieceText = raw.trim();
    if (pieceText === "") return [];
    // The page of the line the piece's first character is on.
    const firstChar = start + raw.length - raw.trimStart().length;
    const lineIndex = lineStarts.findLastIndex((lineStart) => lineStart <= firstChar);
    return [{ page: lines[lineIndex]?.page ?? lines[0]!.page, text: pieceText }];
  });
}

/** Splits part of a text into sentences, as positions in the full text. */
function sentenceSpans(text: string, { start, end }: Span): Span[] {
  // The segmenter ends a sentence at every line break, but here line breaks only come from the
  // PDF's line wrapping. Spaces keep the length the same, so the positions still match `text`.
  const part = text.slice(start, end).replaceAll("\n", " ");
  const spans: Span[] = [];
  for (const { index, segment } of sentences.segment(part)) {
    const span = { start: start + index, end: start + index + segment.length };
    const previous = spans.at(-1);
    // The segmenter sees "f." as a sentence of its own. Keep a list marker with the text after it.
    if (previous && LIST_MARKER.test(text.slice(previous.start, previous.end).trim())) previous.end = span.end;
    else spans.push(span);
  }
  return spans;
}
