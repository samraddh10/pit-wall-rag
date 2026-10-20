import type { ReactNode } from "react";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Controls shown on the right, e.g. the season selector. */
  children?: ReactNode;
}

/** The top bar: the Pit Wall name on the left, the controls passed in on the right. */
export function Header({ children }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <div>
          <h1 className={styles.title}>Pit Wall</h1>
          <p className={styles.tagline}>F1 Sporting Regulations, with checked citations</p>
        </div>
      </div>
      {children}
    </header>
  );
}
