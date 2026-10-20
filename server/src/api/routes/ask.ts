import {
  APICallError,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  RetryError,
  toUIMessageStream,
  type ToolSet,
  type UIMessage,
} from "ai";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getConfig } from "../../config.ts";
import { prepareAnswer, streamAnswer } from "../../rag/answer.ts";
import { validateCitations } from "../../rag/citations.ts";
import type { RetrievedChunk } from "../../rag/retrieve.ts";
import type { AskDataParts, AskSource, ErrorResponse } from "../../shared/api-types.ts";
import { askBodySchema } from "../schemas.ts";

/** The message the ask stream builds in the browser: the answer text plus our two data parts. */
type AskUIMessage = UIMessage<unknown, AskDataParts>;

export const askRouter = Router();

const tooManyQuestions: ErrorResponse = { error: "Too many questions. Please wait a minute and try again." };

/**
 * Each question uses one request of the LLM's free daily quota, so one visitor may ask at most
 * RATE_LIMIT_PER_MIN (5) questions a minute. The counts live in this server's memory, which is
 * enough for a single server and needs no extra service.
 */
const askLimiter = rateLimit({
  windowMs: 60_000,
  limit: getConfig().RATE_LIMIT_PER_MIN,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyQuestions,
});

/** What the web app shows for each source: the chunk's details and its text. */
function toSource(chunk: RetrievedChunk): AskSource {
  return {
    season: chunk.season,
    articleId: chunk.articleId,
    title: chunk.articleTitle,
    page: chunk.page,
    excerpt: chunk.content,
    similarity: chunk.similarity,
  };
}

/**
 * Turns a failed model call into a message for the visitor. The full error is already logged by
 * the AI SDK. A 429 means the free quota ran out, even after the SDK's automatic retries.
 */
function describeLlmError(error: unknown): string {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause) && cause.statusCode === 429) {
    return "The AI model's free usage limit was reached. Please try again in a minute. The sources found for your question are still shown.";
  }
  return "The AI model couldn't answer right now. Please try again. The sources found for your question are still shown.";
}

/**
 * Answers a question as a stream of parts, in this order:
 * 1. `data-sources`: the chunks found for the question,
 * 2. the answer text, a few words at a time as the model writes it,
 * 3. `data-citations`: the citation check, run once the answer is complete.
 */
askRouter.post("/", askLimiter, async (req, res) => {
  const { question, season } = askBodySchema.parse(req.body);

  // Problems found before the stream starts (bad input, database down, season not loaded)
  // still get a normal JSON error with the right status code.
  const prepared = await prepareAnswer(question, season);
  if (prepared.sources.length === 0) {
    const body: ErrorResponse = { error: `The ${season} regulations aren't loaded` };
    res.status(404).json(body);
    return;
  }
  const answer = streamAnswer(prepared);

  const stream = createUIMessageStream<AskUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "data-sources", data: prepared.sources.map(toSource) });

      // The model's output, turned into the same kind of parts. Reasoning (the model's
      // "thinking") stays on the server; the visitor only sees the answer.
      const answerParts = toUIMessageStream<ToolSet, AskUIMessage>({
        stream: answer.stream,
        sendStart: false,
        sendFinish: false,
        sendReasoning: false,
        onError: describeLlmError,
      });

      // Pass the parts on one by one and keep the full text for the citation check. Waiting for
      // each part here (instead of writer.merge(), which copies in the background) guarantees the
      // citations can't arrive before the last words of the answer.
      let text = "";
      for await (const part of answerParts) {
        writer.write(part);
        if (part.type === "text-delta") text += part.delta;
        // The model failed: the error part tells the visitor, and the sources already sent stay usable.
        if (part.type === "error") return;
      }

      writer.write({ type: "data-citations", data: validateCitations(text, prepared.sources) });
      writer.write({ type: "finish" });
    },
    // Only unexpected errors (bugs) reach here; model errors became error parts above.
    onError: (error) => {
      console.error(error);
      return describeLlmError(error);
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
});
