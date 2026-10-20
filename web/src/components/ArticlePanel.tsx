import type { ArticleResponse } from "@shared/api-types.ts";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, getArticle } from "../api/client.ts";
import styles from "./ArticlePanel.module.css";

interface ArticlePanelProps {
  season: number;
  /** The article the chip cited, e.g. "B5.14.2". It stays highlighted. */
  articleId: string;
  onClose: () => void;
}

type Loading =
  | { status: "loading" }
  | { status: "loaded"; article: ArticleResponse }
  | { status: "error"; message: string };

/** "Art. B5.14.2", but "Appendix B4" stays as it is. */
function label(articleId: string): string {
  return articleId.startsWith("Appendix") ? articleId : `Art. ${articleId}`;
}

/** A lettered or numbered item at the start of a line: "a. ", "b) ", "(i) ", "ii. ". */
const ITEM_START = /^\(?(?:[a-z]|[ivx]+)[.)]\s/;
/** PDF lines are about 90–100 characters long. A shorter line didn't wrap: it's a heading or a paragraph's end. */
const SHORT_LINE = 60;

/**
 * The stored text keeps the PDF's line breaks, so a sentence that wrapped in the PDF arrives cut in
 * two and would wrap again, raggedly, in the narrower panel. This joins wrapped lines back together
 * and keeps a line break only where a new item, sentence or heading starts.
 */
function reflow(text: string): string {
  const lines = text.split("\n");
  let result = lines[0] ?? "";
  for (const [index, line] of lines.slice(1).entries()) {
    const previous = lines[index]!.trimEnd();
    if (/[.:;]$/.test(previous) || previous.length < SHORT_LINE || ITEM_START.test(line)) {
      result += `\n${line}`;
    } else {
      // A word split with a hyphen at the end of a line ("PU-" + "ANC") joins without a space.
      result += previous.endsWith("-") ? line : ` ${line}`;
    }
  }
  return result;
}

/**
 * The full text of a cited article, in a panel on the right (full screen on phones). It opens on the
 * cited clause; "Show whole article" moves up to the article it belongs to, with the clause still
 * highlighted. Closes with Esc, the × button or a click on the dimmed page.
 */
export function ArticlePanel({ season, articleId, onClose }: ArticlePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const citedRef = useRef<HTMLElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  // The article on screen: the cited clause at first, then its parent after "Show whole article".
  const [shownId, setShownId] = useState(articleId);
  const [loading, setLoading] = useState<Loading>({ status: "loading" });

  // Open as a modal dialog. The browser then closes it on Esc, keeps keyboard focus inside it, and
  // makes the page behind it unclickable. The check stops React's development double-run from
  // opening it twice.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getArticle(season, shownId, controller.signal)
      .then((article) => setLoading({ status: "loaded", article }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ApiError && error.status === 404
            ? `${label(shownId)} isn't in the ${season} regulations.`
            : "Couldn't load the article. Please try again.";
        setLoading({ status: "error", message });
      });
    return () => controller.abort();
  }, [season, shownId]);

  // Bring the cited clause into view, which matters once the whole article is shown around it.
  useEffect(() => {
    if (loading.status === "loaded") citedRef.current?.scrollIntoView({ block: "start" });
  }, [loading]);

  // close() fires the dialog's "close" event, which calls onClose. Esc does the same on its own.
  // The browser then puts keyboard focus back on the chip that opened the panel.
  const close = () => dialogRef.current?.close();

  function showWholeArticle(parentId: string) {
    setLoading({ status: "loading" });
    setShownId(parentId);
  }

  const article = loading.status === "loaded" ? loading.article : null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.panel}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dimmed page lands on the <dialog> itself, never on its contents. Checking
      // where the press started stops a text selection dragged outside from closing the panel.
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>{season} Sporting Regulations</p>
            <h2 id={titleId} className={styles.title}>
              <span className={styles.id}>{label(shownId)}</span>
              {article?.title && <span> {article.title}</span>}
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.body}>
          {loading.status === "loading" && <p className={styles.status}>Loading {label(shownId)}…</p>}
          {loading.status === "error" && (
            <p className={styles.error} role="alert">
              {loading.message}
            </p>
          )}
          {article && (
            <>
              {article.parentId && (
                <button
                  type="button"
                  className={styles.whole}
                  onClick={() => showWholeArticle(article.parentId!)}
                >
                  Show whole article ({article.parentId}) ↑
                </button>
              )}
              {article.sections.map((section) => {
                const cited = section.articleId === articleId;
                return (
                  <section
                    key={section.articleId}
                    ref={cited ? citedRef : undefined}
                    className={cited ? `${styles.section} ${styles.cited}` : styles.section}
                  >
                    <h3 className={styles.sectionHeading}>
                      <span className={styles.id}>{section.articleId}</span>
                      {section.title && <span>{section.title}</span>}
                      <span className={styles.page}>p. {section.page}</span>
                    </h3>
                    {section.body && <p className={styles.text}>{reflow(section.body)}</p>}
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
