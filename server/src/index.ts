/**
 * Starts the API server.
 *
 * Usage: npm run dev (restarts on file changes) or npm start (after npm run build)
 */
import { createApp } from "./api/app.ts";
import { getConfig } from "./config.ts";
import { embedQuestion } from "./rag/embedder.ts";

const config = getConfig();

// Load the embedding model before taking requests. Otherwise the first question would wait
// several seconds for it, and a memory problem would only show up then.
const started = Date.now();
await embedQuestion("warm-up");
const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
console.log(`Embedding model ready in ${Date.now() - started} ms. Memory in use (RSS): ${rssMb} MB`);

createApp().listen(config.PORT, (error) => {
  if (error) throw error;
  console.log(`Pit Wall API listening on http://localhost:${config.PORT}`);
});
