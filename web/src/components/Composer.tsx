import { useId, useRef } from "react";
import styles from "./Composer.module.css";

/** The API's limit for a question (askBodySchema in the server). */
const MAX_LENGTH = 500;

interface ComposerProps {
  /** The text in the box. Chat keeps it, so an example question can fill the box. */
  value: string;
  onChange: (value: string) => void;
  onSend: (question: string) => void;
  /** True while the server isn't ready or an answer is still arriving. */
  disabled: boolean;
  /** True while an answer is arriving; the button says so. */
  busy: boolean;
  placeholder: string;
}

/**
 * The box where the visitor types a question, kept at the bottom of the screen.
 * Enter sends, Shift+Enter starts a new line.
 */
export function Composer({ value, onChange, onSend, disabled, busy, placeholder }: ComposerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const question = value.trim();

  function submit() {
    if (disabled) return;
    // Nothing typed yet: put the cursor in the box instead of sending an empty question.
    if (question === "") {
      inputRef.current?.focus();
      return;
    }
    onSend(question);
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className={styles.box}>
        <label htmlFor={inputId} className={styles.label}>
          Your question
        </label>
        {/* The text, then the Ask button on the same row */}
        <div className={styles.row}>
          <textarea
            id={inputId}
            ref={inputRef}
            className={styles.input}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Not while an input method is still composing a character (e.g. Japanese or Chinese).
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            maxLength={MAX_LENGTH}
            rows={1}
          />
          {/* Only shown near the limit, so it doesn't distract the rest of the time. */}
          {value.length > MAX_LENGTH - 100 && (
            <span className={styles.count}>
              {value.length}/{MAX_LENGTH}
            </span>
          )}
          <button type="submit" className={styles.send} disabled={disabled}>
            {busy ? "Answering…" : "Ask"}
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
