import { useChat } from "@ai-sdk/react";
import type { AskDataParts, AskRequest, ErrorResponse } from "@shared/api-types.ts";
import { APICallError, DefaultChatTransport, type UIMessage } from "ai";
import { useState } from "react";
import { apiUrl } from "../api/client.ts";
import { ArticlePanel } from "./ArticlePanel.tsx";
import { OpenArticleContext } from "./CitationChip.tsx";
import { Composer } from "./Composer.tsx";
import { MessageList } from "./MessageList.tsx";
import styles from "./Chat.module.css";

/** A message as the ask stream builds it: the answer text plus the `data-sources` and `data-citations` parts. */
export type AskMessage = UIMessage<unknown, AskDataParts>;

/** Questions the retrieval eval answers from the right article (rank 1), so they make a good first try. */
const EXAMPLE_QUESTIONS = [
  { topic: "Race control", question: "What happens if the race gets red-flagged?" },
  { topic: "Pit lane", question: "How fast are cars allowed to drive in the pit lane?" },
  { topic: "Qualifying", question: "What is the 107% rule in qualifying?" },
  { topic: "Tyres", question: "Do drivers have to run two different tyre compounds in a dry race?" },
];

/** The three steps behind every answer, shown under the example questions. */
const STEPS = [
  { title: "Find the articles", text: "Searches the issue of the regulations you’ve selected." },
  { title: "Write the answer", text: "Every claim points back to the article it came from." },
  { title: "Check each citation", text: "Each cited article must be one the answer was written from." },
];

/**
 * useChat normally sends the whole conversation. Our API answers each question on its own, so the
 * request carries only the newest question and the season it's about.
 */
const transport = new DefaultChatTransport<AskMessage>({
  api: apiUrl("/api/ask"),
  prepareSendMessagesRequest: ({ messages, body }) => {
    const latest = messages.at(-1);
    const question = latest?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
    const request: AskRequest = { question, season: Number(body?.season) };
    return { body: request };
  },
});

interface Notice {
  message: string;
  /** Too many questions: shown in yellow, because waiting a minute fixes it. */
  rateLimited: boolean;
}

/** Turns a failed question into a short message for the visitor. */
function describeError(error: Error): Notice {
  // The server refused before the answer started (e.g. 429). Its reply is our JSON { error }.
  if (APICallError.isInstance(error)) {
    let message = "Something went wrong on the server. Please try again.";
    try {
      const body = JSON.parse(error.responseBody ?? "") as Partial<ErrorResponse>;
      if (body.error) message = body.error;
    } catch {
      // Not JSON (e.g. a proxy's error page): keep the general message.
    }
    return { message, rateLimited: error.statusCode === 429 };
  }
  // fetch itself failed: the server is off or the connection dropped.
  if (error instanceof TypeError) {
    return { message: "Can't reach the server. Check your connection and try again.", rateLimited: false };
  }
  // An error part inside the stream. The server already wrote a friendly message for it.
  return { message: error.message, rateLimited: false };
}

interface ChatProps {
  /** The season to ask about; null until the list of seasons has loaded. */
  season: number | null;
}

/**
 * The chat. The input box stays at the bottom of the screen. Above it, the start screen shows an
 * intro, example questions and how answers are checked; after the first question, the questions
 * and streamed answers.
 * Clicking a citation chip opens the article panel on top.
 */
export function Chat({ season }: ChatProps) {
  const { messages, sendMessage, status, error } = useChat<AskMessage>({ transport });
  // "submitted": waiting for the reply to start. "streaming": the reply is arriving.
  const busy = status === "submitted" || status === "streaming";
  const canAsk = season !== null && !busy;
  const started = messages.length > 0;
  // The text in the input box, and the example question that filled it (highlighted until edited).
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  // The article shown in the side panel; null while it's closed.
  const [openArticle, setOpenArticle] = useState<{ season: number; articleId: string } | null>(null);

  function ask(question: string) {
    if (season === null || busy) return;
    // The season goes with each question, so switching seasons only affects the next question.
    void sendMessage({ text: question }, { body: { season } });
    setDraft("");
    setPicked(null);
  }

  /** Called by a citation chip. Chips that don't know their season use the season being asked about. */
  function showArticle(articleId: string, citedSeason?: number) {
    const articleSeason = citedSeason ?? season;
    if (articleSeason !== null) setOpenArticle({ season: articleSeason, articleId });
  }

  // Shown inside the message list: in the answer that failed, or under a refused question.
  let notice = null;
  if (error) {
    const { message, rateLimited } = describeError(error);
    notice = (
      <p className={rateLimited ? styles.rateLimit : styles.error} role="alert">
        {message}
      </p>
    );
  }

  // The Composer keeps the same place in the tree on both screens ({!started && …} still holds a
  // place when it's false), so the box keeps focus when the first question starts the conversation.
  return (
    <div className={started ? styles.chat : `${styles.chat} ${styles.start}`}>
      {started ? (
        // Every citation chip inside the answers can call showArticle through this context.
        <OpenArticleContext value={showArticle}>
          <MessageList messages={messages} busy={busy} notice={notice} />
        </OpenArticleContext>
      ) : (
        <div className={styles.intro}>
          <h2 className={styles.heading}>Ask the rulebook.</h2>
          <p className={styles.lead}>
            Ask a question about the {season !== null && `${season} `}FIA Formula 1 Sporting
            Regulations. Every answer cites the article it came from, and each citation is checked
            before it's shown.
          </p>
        </div>
      )}

      {!started && (
        <>
          <section className={styles.examples} aria-labelledby="examples-heading">
            <h3 id="examples-heading" className={styles.smallHeading}>
              Or start with one of these
            </h3>
            <div className={styles.exampleGrid}>
              {EXAMPLE_QUESTIONS.map(({ topic, question }) => (
                // Fills the box, so the question can be read or edited before asking it.
                <button
                  key={question}
                  type="button"
                  className={styles.example}
                  aria-pressed={picked === question}
                  onClick={() => {
                    setDraft(question);
                    setPicked(question);
                  }}
                >
                  <span className={styles.exampleText}>
                    <span className={styles.topic}>{topic}</span>
                    <span className={styles.question}>{question}</span>
                  </span>
                  <svg
                    className={styles.arrow}
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          </section>

          <ol className={styles.steps} aria-label="How answers are checked">
            {STEPS.map(({ title, text }, index) => (
              <li key={title} className={styles.step}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.stepText}>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <Composer
        value={draft}
        onChange={(text) => {
          setDraft(text);
          setPicked(null);
        }}
        onSend={ask}
        disabled={!canAsk}
        busy={busy}
        placeholder={
          season === null
            ? "Waiting for the server…"
            : started
              ? "Ask another question…"
              : "Ask about penalties, tyres…"
        }
      />

      {openArticle && (
        <ArticlePanel
          season={openArticle.season}
          articleId={openArticle.articleId}
          onClose={() => setOpenArticle(null)}
        />
      )}
    </div>
  );
}
