/**
 * Downloads the embedding model into MODEL_CACHE_DIR and checks that it works.
 * Render runs this at build time, so the server never has to fetch the model from
 * Hugging Face when it wakes up.
 *
 * Usage: npm run model:prefetch
 */
import { resolve } from "node:path";
import { getConfig } from "../config.ts";
import { EMBEDDING_MODEL, embedQuestion } from "../rag/embedder.ts";

async function main(): Promise<void> {
  const started = Date.now();
  // Loading the model downloads any files missing from the cache; one embedding proves they work.
  const vector = await embedQuestion("warm-up");
  console.log(
    `${EMBEDDING_MODEL} is ready in ${resolve(getConfig().MODEL_CACHE_DIR)} ` +
      `(${vector.length} dimensions, ${Date.now() - started} ms)`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
