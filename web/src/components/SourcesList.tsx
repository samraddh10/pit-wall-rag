import type { AskSource } from "@shared/api-types.ts";
import styles from "./SourcesList.module.css";

interface SourcesListProps {
  sources: AskSource[];
}

/**
 * The passages the search found and the model was given, best match first. They're always shown,
 * so anyone can check an answer against the rulebook text: the citation check catches made-up
 * article numbers, but not a real article cited for the wrong claim.
 */
export function SourcesList({ sources }: SourcesListProps) {
  return (
    <section className={styles.sources}>
      <h3 className={styles.heading}>Sources</h3>
      <ol className={styles.list}>
        {sources.map((source, index) => (
          // The same article can appear twice (a long clause is split into chunks), so the
          // position makes the key unique.
          <li key={`${index}-${source.articleId}`}>
            <details className={styles.source}>
              <summary className={styles.summary}>
                <span className={styles.id}>{source.articleId}</span>
                {source.title && <span className={styles.title}>{source.title}</span>}
                <span
                  className={styles.meta}
                  title="How close this passage is in meaning to the question (1 = same meaning)"
                >
                  p. {source.page} · match {source.similarity.toFixed(2)}
                </span>
              </summary>
              <p className={styles.excerpt}>{source.excerpt}</p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
