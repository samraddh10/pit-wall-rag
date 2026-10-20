import type { AskCitations, AskSource } from "@shared/api-types.ts";
import { type ReactNode, useEffect, useRef } from "react";
import { AnswerMarkdown } from "./AnswerMarkdown.tsx";
import type { AskMessage } from "./Chat.tsx";
import { SourcesList } from "./SourcesList.tsx";
import styles from "./MessageList.module.css";

/** A message's pieces, collected from its parts. */
function readMessage(message: AskMessage) {
  let text = "";
  let sources: AskSource[] | undefined;
  let citations: AskCitations | undefined;
  for (const part of message.parts) {
    if (part.type === "text") text += part.text;
    else if (part.type === "data-sources") sources = part.data;
    else if (part.type === "data-citations") citations = part.data;
  }
  return { text, sources, citations };
}

/** Shown while the reply hasn't started, or the sources are in but the answer text isn't yet. */
function Working() {
  return (
    <p className={styles.working} role="status">
      <span className={styles.light} aria-hidden="true" />
      Reading the regulations…
    </p>
  );
}

interface AnswerProps {
  message: AskMessage;
  /** True while this answer is still arriving. */
  streaming: boolean;
  /** An error that stopped this answer part-way, shown right where the text stops. */
  notice: ReactNode;
}

/** One answer: the text with citation chips (or the "not found" notice), then its sources. */
function Answer({ message, streaming, notice }: AnswerProps) {
  const { text, sources, citations } = readMessage(message);
  // Only a pure "not found" gets the special style. If anything was verified, the answer has
  // real content, so it's shown as written.
  const notFound = citations?.notFound === true && citations.verified.length === 0;

  let body = null;
  if (notFound) {
    body = (
      <div className={styles.notFound}>
        <strong>Not found in the regulations.</strong>
        <span>
          None of the articles found for this question answers it. Try asking another way, or check
          the sources below.
        </span>
      </div>
    );
  } else if (text) {
    body = <AnswerMarkdown text={text} citations={citations} streaming={streaming} />;
  } else if (streaming) {
    body = <Working />;
  }

  return (
    <article className={styles.answer}>
      {body}
      {notice}
      {sources && sources.length > 0 && <SourcesList sources={sources} />}
    </article>
  );
}

interface MessageListProps {
  messages: AskMessage[];
  /** True while the newest answer is still on its way. */
  busy: boolean;
  /** An error with the newest question, if there is one. */
  notice: ReactNode;
}

/** Every question and answer so far, oldest first. */
export function MessageList({ messages, busy, notice }: MessageListProps) {
  const lastIndex = messages.length - 1;
  const lastQuestionIndex = messages.findLastIndex((message) => message.role === "user");
  const lastQuestion = useRef<HTMLDivElement>(null);

  // A new question scrolls to the top of the screen, so its answer has room to stream in below.
  useEffect(() => {
    lastQuestion.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastQuestionIndex]);

  return (
    <div className={styles.list}>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div
            key={message.id}
            ref={index === lastQuestionIndex ? lastQuestion : undefined}
            className={styles.question}
          >
            {readMessage(message).text}
          </div>
        ) : (
          <Answer
            key={message.id}
            message={message}
            streaming={busy && index === lastIndex}
            notice={index === lastIndex ? notice : null}
          />
        ),
      )}
      {/* Until the first part of the reply arrives, there's no answer message to show these in. */}
      {messages[lastIndex]?.role === "user" && (busy ? <Working /> : notice)}
    </div>
  );
}
