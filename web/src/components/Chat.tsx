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
  "What happens if the race gets red-flagged?",
  "How fast are cars allowed to drive in the pit lane?",
  "What is the 107% rule in qualifying?",
  "Do drivers have to run two different tyre compounds in a dry race?",
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
 * The chat: example questions to start, then the questions and streamed answers, then the input box.
 * Clicking a citation chip opens the article panel on top.
 */
export function Chat({ season }: ChatProps) {
  const { messages, sendMessage, status, error } = useChat<AskMessage>({ transport });
  // "submitted": waiting for the reply to start. "streaming": the reply is arriving.
  const busy = status === "submitted" || status === "streaming";
  const canAsk = season !== null && !busy;
  // The article shown in the side panel; null while it's closed.
  const [openArticle, setOpenArticle] = useState<{ season: number; articleId: string } | null>(null);

  function ask(question: string) {
    if (season === null || busy) return;
    // The season goes with each question, so switching seasons only affects the next question.
    void sendMessage({ text: question }, { body: { season } });
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

  return (
    <div className={styles.chat}>
      {messages.length === 0 ? (
        <section>
          <h2>Ask the rulebook</h2>
          <p className={styles.lead}>
            Ask a question about the {season !== null && `${season} `}FIA Formula 1 Sporting
            Regulations. Every answer cites the article it came from, and each citation is checked
            before it's shown.
          </p>
          <div className={styles.examples}>
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className={styles.example}
                disabled={!canAsk}
                onClick={() => ask(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      ) : (
        // Every citation chip inside the answers can call showArticle through this context.
        <OpenArticleContext value={showArticle}>
          <MessageList messages={messages} busy={busy} notice={notice} />
        </OpenArticleContext>
      )}

      <Composer
        onSend={ask}
        disabled={!canAsk}
        busy={busy}
        placeholder={season === null ? "Waiting for the server…" : "Ask about the rules…"}
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
