import { generateText, streamText, type ModelMessage } from "ai";
import { validateCitations, type CitationCheck } from "./citations.ts";
import { getModel, LLM_SETTINGS } from "./llm.ts";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.ts";
import { retrieve, type RetrievedChunk } from "./retrieve.ts";

/** Everything needed to ask the model, plus the chunks the answer must be checked against. */
export interface PreparedAnswer {
  sources: RetrievedChunk[];
  instructions: string;
  messages: ModelMessage[];
}

/**
 * Finds the chunks for a question and builds the messages for the model. The command-line
 * `ask` script and the API both start here, so they always send the model the same thing.
 */
export async function prepareAnswer(question: string, season: number): Promise<PreparedAnswer> {
  const sources = await retrieve(question, season);
  return {
    sources,
    instructions: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(question, season, sources) }],
  };
}

export interface AnswerResult {
  answer: string;
  sources: RetrievedChunk[];
  citations: CitationCheck;
}

/**
 * Answers a question in one go (no streaming), for the command line: retrieve, ask the model,
 * then check the citations in its answer.
 */
export async function answerQuestion(question: string, season: number): Promise<AnswerResult> {
  const { sources, instructions, messages } = await prepareAnswer(question, season);
  if (sources.length === 0) {
    throw new Error(`No chunks found for ${season}. Ingest it first: npm run ingest -- --season ${season}`);
  }

  const { text } = await generateText({ model: getModel(), ...LLM_SETTINGS, instructions, messages });
  return { answer: text, sources, citations: validateCitations(text, sources) };
}

/**
 * Starts the model's answer as a stream, for the API: the words arrive while they are written.
 * Same model, settings and messages as `answerQuestion`, so both give the same kind of answer.
 */
export function streamAnswer({ instructions, messages }: PreparedAnswer) {
  return streamText({ model: getModel(), ...LLM_SETTINGS, instructions, messages });
}
