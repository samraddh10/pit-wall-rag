import { z } from "zod";

/**
 * A season year. URL parts arrive as strings ("2026"), so they are turned into numbers first.
 * The range also keeps the value inside the database's smallint column.
 */
export const seasonSchema = z.coerce.number().int().min(1950).max(2100);

/**
 * Article IDs look like "B5.14.2", "57.2" or "Appendix B1". Only the allowed characters are
 * checked here: a well-formed ID that doesn't exist (e.g. "Z9") is a 404, not a bad request.
 */
export const articleIdSchema = z
  .string()
  .max(40)
  .regex(/^[A-Za-z0-9. ]+$/, "Only letters, digits, dots and spaces are allowed");

/** GET /api/articles/:season/:articleId */
export const articleParamsSchema = z.object({
  season: seasonSchema,
  articleId: articleIdSchema,
});

/** POST /api/ask. Spaces around the question are removed first, so "   " counts as empty. */
export const askBodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  season: seasonSchema,
});
