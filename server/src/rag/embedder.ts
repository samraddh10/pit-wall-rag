import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { getConfig } from "../config.ts";

/**
 * The embedding model. Ingestion and questions must use the same model and settings,
 * or their vectors can't be compared, so both go through this file.
 */
export const EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

/**
 * bge models are trained to put this in front of a search question (not in front of the texts
 * being searched), so a short question lands nearer the passages that answer it.
 */
const QUESTION_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

/**
 * Loads the model once (downloaded on first use, then read from MODEL_CACHE_DIR) and reuses it.
 * In production the folder is filled at build time by `npm run model:prefetch`, so a waking
 * server reads the model from disk instead of downloading it again.
 */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  // The 8-bit (q8) weights are about 4× smaller than the full ones, with near-identical results.
  extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL, {
    dtype: "q8",
    cache_dir: getConfig().MODEL_CACHE_DIR,
  });
  return extractor;
}

/**
 * Turns each text into an embedding: 384 numbers that capture its meaning.
 * CLS pooling keeps the vector of the special first token, which bge is trained to use as the
 * summary of the whole text, and normalize scales it to length 1, so cosine similarity compares
 * direction only.
 *
 * Texts go through the model one at a time, never in batches. The 8-bit model scales its
 * numbers using everything in the batch, so a batched text would get a slightly different
 * vector than the same text on its own (the way a question is embedded).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const extract = await getExtractor();
  const vectors: number[][] = [];
  for (const text of texts) {
    const output = await extract(text, { pooling: "cls", normalize: true });
    vectors.push((output.tolist() as number[][])[0]!);
  }
  return vectors;
}

/** Embeds a search question, with the prefix bge expects in front of questions. */
export async function embedQuestion(question: string): Promise<number[]> {
  const [vector] = await embed([`${QUESTION_PREFIX}${question}`]);
  return vector!;
}
