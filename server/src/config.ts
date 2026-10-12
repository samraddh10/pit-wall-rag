import { z } from "zod";

/**
 * All settings the server and scripts read from environment variables.
 * Checking them once, at startup, turns a missing or mistyped value into a
 * clear error message instead of a confusing crash later on.
 */
const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(5),

  LLM_PROVIDER: z.enum(["groq", "google"]).default("groq"),
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  // Only the key for the chosen provider is needed, so both are optional here.
  GROQ_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),

  MODEL_CACHE_DIR: z.string().min(1).default(".model-cache"),
});

export type Config = z.infer<typeof envSchema>;

/** Validates a set of environment variables and fills in defaults. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // Treat empty values (e.g. "GROQ_API_KEY=" in .env) as "not set".
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ""),
  );

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cached: Config | undefined;

/** The validated config for this process (read from process.env on first use). */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}
