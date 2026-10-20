import { Router } from "express";
import type { HealthResponse } from "../../shared/api-types.ts";

export const healthRouter = Router();

/**
 * Answers "is the server up?" for Render's health check and the web app's wake-up ping.
 * It doesn't touch the database on purpose: a frequent ping would keep Neon's free database
 * awake and use up its compute hours.
 */
healthRouter.get("/", (_req, res) => {
  const body: HealthResponse = { ok: true };
  res.json(body);
});
