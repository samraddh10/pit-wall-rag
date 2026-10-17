import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { getConfig } from "../config.ts";

/**
 * Settings every answer is generated with, whichever provider is chosen.
 * - Low reasoning effort: the model "thinks" only briefly before answering. That keeps answers
 *   fast and uses fewer tokens of the free per-minute quota. The AI SDK translates this one
 *   setting into each provider's own option.
 * - Low temperature: less randomness, so the model sticks closely to the given articles.
 */
export const LLM_SETTINGS = {
  reasoning: "low",
  temperature: 0.2,
} as const;

/**
 * The language model chosen in the environment: `LLM_PROVIDER` (groq or google) and `LLM_MODEL`.
 * Changing provider is an env-var change; the rest of the code only sees a `LanguageModel`.
 */
export function getModel(): LanguageModel {
  const config = getConfig();

  if (config.LLM_PROVIDER === "google") {
    if (!config.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing. Add it to server/.env.");
    }
    return createGoogle({ apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY })(config.LLM_MODEL);
  }

  if (!config.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing. Add it to server/.env (free key at console.groq.com).");
  }
  return createGroq({ apiKey: config.GROQ_API_KEY })(config.LLM_MODEL);
}
