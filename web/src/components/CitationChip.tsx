import type { AskCitation } from "@shared/api-types.ts";
import { createContext, useContext } from "react";
import styles from "./CitationChip.module.css";

/**
 * Opens the article panel for an article (in a given season, when the chip knows it). Chat provides
 * it, so a chip deep inside an answer can open the panel without every component in between having
 * to pass it along.
 */
export const OpenArticleContext = createContext<(articleId: string, season?: number) => void>(() => {});

/** Read like sector colours on a timing screen: green = verified, yellow = still checking, grey = unverified. */
export type CitationStatus = "verified" | "checking" | "unverified";

/** A symbol for each status, so it doesn't rely on colour alone. */
const ICONS: Record<CitationStatus, string> = { verified: "✓", checking: "…", unverified: "✕" };

interface CitationChipProps {
  articleId: string;
  status: CitationStatus;
  /** For a verified citation: the article's title and page. */
  citation?: AskCitation;
}

/** The tooltip: what the status means for this article. */
function describe({ articleId, status, citation }: CitationChipProps): string {
  switch (status) {
    case "verified": {
      const title = citation?.title ? ` · ${citation.title}` : "";
      const page = citation ? ` · page ${citation.page}` : "";
      return `Verified: Art. ${articleId}${title}${page} is one of the sources. Click to read it.`;
    }
    case "checking":
      return `Art. ${articleId} is checked once the answer is complete. Click to read it.`;
    case "unverified":
      return `Unverified: Art. ${articleId} isn't one of the sources found for this question. Click to look it up.`;
  }
}

/**
 * A citation in an answer, e.g. "B5.14.2 ✓", coloured by whether the server's check confirmed it.
 * Clicking it opens the article's full text.
 */
export function CitationChip(props: CitationChipProps) {
  const { articleId, status, citation } = props;
  const openArticle = useContext(OpenArticleContext);
  return (
    <button
      type="button"
      className={`${styles.chip} ${styles[status]}`}
      title={describe(props)}
      // A verified citation knows its season; for the others, Chat uses the season that was asked about.
      onClick={() => openArticle(articleId, citation?.season)}
    >
      <span className={styles.id}>{articleId}</span>
      <span aria-hidden="true">{ICONS[status]}</span>
      {/* Read out by screen readers instead of the symbol. */}
      <span className={styles.srOnly}> ({status})</span>
    </button>
  );
}
