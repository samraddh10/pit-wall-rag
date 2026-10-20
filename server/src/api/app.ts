import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import { z } from "zod";
import { getConfig } from "../config.ts";
import type { ErrorResponse } from "../shared/api-types.ts";
import { articlesRouter } from "./routes/articles.ts";
import { healthRouter } from "./routes/health.ts";
import { seasonsRouter } from "./routes/seasons.ts";

/** Any path no route matched. */
const notFound: RequestHandler = (req, res) => {
  const body: ErrorResponse = { error: `No such endpoint: ${req.method} ${req.path}` };
  res.status(404).json(body);
};

/**
 * Turns every error into a JSON reply. Express 5 sends errors thrown inside async routes here
 * automatically, so the routes need no try/catch.
 */
const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // If part of the reply was already sent, Express has to close the connection itself.
  if (res.headersSent) {
    next(error);
    return;
  }

  // Bad input (from a zod `.parse()` in a route).
  if (error instanceof z.ZodError) {
    const body: ErrorResponse = {
      error: "Invalid request",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
    res.status(400).json(body);
    return;
  }

  // Errors Express raises itself carry a status, e.g. 400 for broken JSON or 413 for a body
  // over the size limit. Their messages are safe to show.
  const status: unknown = error?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const body: ErrorResponse = { error: error.message };
    res.status(status).json(body);
    return;
  }

  // Anything else is a bug or an outage (e.g. the database is down): log the details,
  // but don't send them to the browser.
  console.error(error);
  const body: ErrorResponse = { error: "Something went wrong on the server" };
  res.status(500).json(body);
};

/** Builds the Express app: shared middleware, the /api routes, then the 404 and error handlers. */
export function createApp(): Express {
  const app = express();

  // In production the app sits behind Render's proxy. Trusting that one hop makes `req.ip`
  // the visitor's real address, which the rate limiter needs.
  app.set("trust proxy", 1);
  // Only the web app's own address may call the API from a browser.
  app.use(cors({ origin: getConfig().CORS_ORIGIN }));
  // Requests are tiny (a question is at most 500 characters), so anything big is refused.
  app.use(express.json({ limit: "10kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/seasons", seasonsRouter);
  app.use("/api/articles", articlesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
