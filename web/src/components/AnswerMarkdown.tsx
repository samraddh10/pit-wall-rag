import type { AskCitation, AskCitations } from "@shared/api-types.ts";
import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import { CitationChip, type CitationStatus } from "./CitationChip.tsx";
import styles from "./AnswerMarkdown.module.css";

/*
 * The same marker rules as the server's citation check (server/src/rag/citations.ts), so every
 * marker the server checks becomes a chip here. The web app only imports types from the server,
 * so the rules are copied; keep the two in step.
 */

/** "[Art. B5.14.2]", "【Art. B5.14.2】", "[Arts. B5.14.1, B5.14.2]", "[Appendix B4]", … */
const MARKER = /[[【]((?:Articles?|Arts?)\b\.?\s*[^\]】]+|Appendix\s+[^\]】]+)[\]】]/gi;
/** Separators between several IDs in one bracket. */
const SEPARATOR = /\s*(?:[,;&/]|\band\b)\s*/i;
/** The "Art." or "Article" in front of an ID. */
const PREFIX = /^(?:Articles?|Arts?)\b\.?\s*/i;
/** A lettered item on its own, like the "b)" in "[Art. 57.2 a), b)]". */
const ITEM_ONLY = /^\(?(?:[a-z]|[ivx]+)[.)]?$/i;
/** The article ID at the start of a cited text: "B5.14.2", "57.2" or "Appendix B4". */
const ID_AT_START = /^(appendix\s+)?([a-z]?\d+(?:\.\d+)*)/i;

/** The article IDs inside one marker's brackets. */
function citedIds(inside: string): string[] {
  const ids: string[] = [];
  for (const part of inside.split(SEPARATOR)) {
    const cited = part.replace(PREFIX, "").trim();
    if (cited === "" || ITEM_ONLY.test(cited)) continue;
    const match = ID_AT_START.exec(cited);
    // Text that isn't an ID is kept as written; the server rejects it, so it shows as unverified.
    ids.push(match ? `${match[1] ? "Appendix " : ""}${match[2]!.toUpperCase()}` : cited);
  }
  return ids;
}

/** Links to "#cite-<ID>" mark citations. The link component below turns them into chips. */
const CITE_PREFIX = "#cite-";

/** Makes an ID safe inside a Markdown link address (a ")" would end the address early). */
function encodeId(id: string): string {
  return encodeURIComponent(id).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Rewrites each marker as one Markdown link per cited ID: "[Art. B5.14.2]" → "[B5.14.2](#cite-B5.14.2)". */
function markersToLinks(text: string): string {
  return text.replace(MARKER, (marker, inside: string) => {
    const ids = citedIds(inside);
    if (ids.length === 0) return marker;
    return ids.map((id) => `[${id.replace(/[[\]]/g, "")}](${CITE_PREFIX}${encodeId(id)})`).join(" ");
  });
}

interface AnswerMarkdownProps {
  text: string;
  /** The server's citation check; undefined until the answer is complete. */
  citations: AskCitations | undefined;
  /** True while the answer is still arriving. */
  streaming: boolean;
}

/** The answer text as formatted Markdown, with each citation marker shown as a coloured chip. */
export function AnswerMarkdown({ text, citations, streaming }: AnswerMarkdownProps) {
  // Rebuilt only when the check arrives or streaming ends, not for every new word.
  const components = useMemo<Components>(() => {
    function chipStatus(articleId: string): { status: CitationStatus; citation?: AskCitation } {
      const citation = citations?.verified.find((verified) => verified.articleId === articleId);
      if (citation) return { status: "verified", citation };
      // No check yet: still arriving means "checking". Otherwise the check never ran (the answer
      // failed part-way), so the citation can't be trusted.
      if (!citations && streaming) return { status: "checking" };
      return { status: "unverified" };
    }

    return {
      a: ({ href, children }) => {
        if (href?.startsWith(CITE_PREFIX)) {
          const articleId = decodeURIComponent(href.slice(CITE_PREFIX.length));
          return <CitationChip articleId={articleId} {...chipStatus(articleId)} />;
        }
        // Any other link in an answer opens in a new tab.
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    };
  }, [citations, streaming]);

  return (
    <div className={styles.answer}>
      <Markdown components={components}>{markersToLinks(text)}</Markdown>
    </div>
  );
}
