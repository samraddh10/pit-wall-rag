import { useState } from "react";
import styles from "./Composer.module.css";

/** The API's limit for a question (askBodySchema in the server). */
const MAX_LENGTH = 500;

interface ComposerProps {
  onSend: (question: string) => void;
  /** True while the server isn't ready or an answer is still arriving. */
  disabled: boolean;
  /** True while an answer is arriving; the button says so. */
  busy: boolean;
  placeholder: string;
}

/** The box where the visitor types a question. Enter sends, Shift+Enter starts a new line. */
export function Composer({ onSend, disabled, busy, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const question = text.trim();

  function submit() {
    if (disabled || question === "") return;
    onSend(question);
    setText("");
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
        <textarea
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Not while an input method is still composing a character (e.g. Japanese or Chinese).
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          rows={2}
          aria-label="Your question"
        />
        <button type="submit" className={styles.send} disabled={disabled || question === ""}>
          {busy ? "Answering…" : "Ask"}
        </button>
      </div>
      {/* Only shown near the limit, so it doesn't distract the rest of the time. */}
      {text.length > MAX_LENGTH - 100 && (
        <p className={styles.count}>
          {text.length}/{MAX_LENGTH}
        </p>
      )}
    </form>
  );
}
