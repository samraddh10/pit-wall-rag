import type { ReactNode } from "react";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Called when the logo or name is clicked, to go back to the start screen. */
  onHome: () => void;
  /** Controls shown on the right, e.g. the season selector. */
  children?: ReactNode;
}

/** The top bar: the Pit Wall name on the left (a link to the start screen), the controls passed in on the right. */
export function Header({ onHome, children }: HeaderProps) {
  return (
    <header className={styles.header}>
      <a
        href="/"
        className={styles.brand}
        onClick={(event) => {
          // Ctrl/Cmd/Shift/Alt or middle click: let the browser open a new tab or window as usual.
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          // A plain click resets the page in place, so the server needn't wake up again and the season stays.
          event.preventDefault();
          onHome();
        }}
      >
        {/* Empty alt: the name next to it already says "Pit Wall" */}
        <img className={styles.logo} src="/pit-wall-icon.svg" alt="" width={40} height={40} />
        <div>
          <h1 className={styles.title}>Pit Wall</h1>
          <p className={styles.tagline}>F1 Sporting Regulations, with checked citations</p>
        </div>
      </a>
      {children}
    </header>
  );
}
